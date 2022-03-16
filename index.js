import axios from "axios";

const monitorID = process.env.MONITOR_ID;
const APISecret = process.env.API_SECRET;
const APIBaseURI = process.env.API_BASE_URI;

const collection = "repositories";
const recordEventURL =
  APIBaseURI + "/monitors/" + monitorID + "/events/" + collection;
const fetchInstancesURL = APIBaseURI + "/monitors/" + monitorID + "/instances";
const fetchAccessTokenURL =
  APIBaseURI + "/monitors/" + monitorID + "/users/oauth/token";
const markAsUpdatedURL =
  APIBaseURI + "/monitors/" + monitorID + "/instances/markasupdated";

async function main() {
  console.log(`Collector started`);

  let instances;
  let updatedInstancesIDs = [];

  // fetch instances
  await axios(fetchInstancesURL, {
    method: "GET",
    headers: {
      Authorization: APISecret,
    },
  })
    .then((response) => {
      let data = response.data;
      instances = data.instances;
      console.log(`Fetched ${instances.length} instances`);
    })
    .catch((err) => {
      console.error("Error fetching instances:", err);
    });

  if (instances) {
    for (let i = 0; i < instances.length; i++) {
      let instance = instances[i];
      let accessToken;

      // fetch access token
      await axios(fetchAccessTokenURL + "?user_id=" + instance.user_id, {
        method: "GET",
        headers: {
          Authorization: APISecret,
        },
      })
        .then((response) => {
          let data = response.data;
          accessToken = data.access_token;
          console.log(`Fetched access token for user ${instance.user_id}`);
        })
        .catch((err) => {
          console.error(
            "Error fetching access token for user " + instance.user_id + ": ",
            err
          );
        });

      if (accessToken) {
        let event = {};
        let repoID = instance.parameters.url
          .split("https://github.com/")[1]
          .split("?")[0];

        // fetch repo info
        await axios("https://api.github.com/repos/" + repoID, {
          method: "GET",
          headers: {
            Authorization: accessToken,
            Accept: "application/vnd.github.v3+json",
          },
        })
          .then((response) => {
            let data = response.data;
            let stars = data.stargazers_count;
            let forks = data.forks_count;
            let watchers = data.subscribers_count;

            event = {
              stars: stars,
              forks: forks,
              watchers: watchers,
              user_id: instance.user_id,
              url: instance.parameters.url,
              _id: instance.id,
            };
          })
          .catch((err) => {
            console.error(
              "Error fetching repo information for instance " +
                instance.id +
                ": ",
              err
            );
          });

        if (Object.keys(event).length > 0) {
          // record event with repository info
          await axios(recordEventURL, {
            method: "POST",
            data: event,
            headers: {
              Authorization: APISecret,
            },
          })
            .then(() => {
              console.log(`Updated instance ${instance.id}`);
              updatedInstancesIDs.push(instance.id);
            })
            .catch((err) => {
              console.error(
                "Error recording event for instance " + instance.id + ": ",
                err
              );
            });
        }
      } else {
        console.log(`No access token for user ${instance.user_id}`);
      }
    }

    if (updatedInstancesIDs.length > 0) {
      await axios(markAsUpdatedURL, {
        method: "POST",
        data: {
          instances: updatedInstancesIDs,
        },
        headers: {
          Authorization: APISecret,
        },
      })
        .then(() => {
          console.log(`Updated ${updatedInstancesIDs.length} instances`);
        })
        .catch((err) => {
          console.error("Error marking instances as updated", err);
        });
    }
  }

  console.log("Done");
}

main();
