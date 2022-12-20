require("dotenv").config();
const tmi = require("tmi.js");
const https = require("https");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(process.env.DB_LOC, (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log("Connected to the database.");
  }
});

db.run(
  "CREATE TABLE IF NOT EXISTS " +
    process.env.TABLE_NAME +
    "(" +
    process.env.COL1 +
    " " +
    process.env.COL_TYPE +
    "," +
    process.env.COL2 +
    " " +
    process.env.COL_TYPE +
    ")"
);

const URL = "api.twitch.tv";
const api_version = "/helix/";
const pathInfo = api_version + "users?login=";
const pathTitle = api_version + "channels?broadcaster_id=";
const pathGame = api_version + "games?name=";

// const pathMod = api_version + 'moderation/moderators?broadcaster_id=';
// let pathBan = api_version + 'moderation/bans?broadcaster_id=';

// Define configuration options
const opts = {
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_OAUTH,
  },
  channels: process.env.TWITCH_CH_LIST.split(","),
};

const hiddencommandList = ["!gameinfo", "!id", "!info"];

const commandList = [
  "!addcmd",
  "!bot",
  "!changegame",
  "!changetitle",
  "!commands",
  "!delcmd",
  "!dice",
  "!title",
];

// Create a client with our options
const client = new tmi.client(opts);

// Register our event handlers (defined below)
client.on("message", onMessageHandler);
client.on("connected", onConnectedHandler);

// Connect to Twitch:
client.connect();

// oath without the 'oauth:' part
const oauth = process.env.TWITCH_OAUTH.substring(
  6,
  process.env.TWITCH_OAUTH.length
);

/*
    target = name of channel someone is typing in
    context = information of the user that typed in the chat
    msg = the entire command message
*/

// Called every time a message comes in
async function onMessageHandler(target, context, msg, self) {
  if (self) {
    return;
  }
  // console.log(msg);
  msg = msg.toLowerCase();

  let user = context["display-name"];
  let commandName = "";
  let input = "";
  let label = "";
  const msgLength = msg.split(" ").length;
  const ch_name = target.substring(1, target.length); // gets the name of channel someone is talking in without the #

  let mod_status = context.mod; // checks mod status
  if (context.username === process.env.TWITCH_CH_LIST) {
    // super ghetto way to make channel mod even though it's mod but twitch api says it's not mod
    mod_status = true;
  }

  let cmd_list = await get_all("SELECT * FROM " + process.env.TABLE_NAME);

  if (msgLength >= 2) {
    commandName = msg.substr(0, msg.indexOf(" ") + 1).trim();
    input = msg.replace(commandName, "").trim();
  } else {
    commandName = msg.trim();
  }

  try {
    const cmd = input.substring(0, input.indexOf(" "));
    const cmdtxt = input.substring(input.indexOf(" ") + 1, input.length);
    // If the command is known, let's execute it
    if (commandName === "!dice") {
      let num = 0;
      if (input === "") {
        num = rollDice(6);
      } else {
        num = rollDice(input);
      }
      client.say(target, `@${user}, You rolled a ${num}`);
      console.log(`* Executed ${commandName} command`);
    } else if (commandName === "!addcmd" && mod_status === true) {
      if (!cmd_list.includes(cmd)) {
        db.run(
          "INSERT INTO " +
            process.env.TABLE_NAME +
            "(" +
            process.env.COL1 +
            "," +
            process.env.COL2 +
            ")" +
            " VALUES(?, ?)",
          [cmd, cmdtxt],
          (err) => {
            if (err) {
              return console.log(err.message);
            }
            client.say(target, `@${user}, ${cmd} was added`);
          }
        );
      } else {
        client.say(target, `@${user}, ${cmd} already exists`);
      }
    } else if (commandName === "!bot") {
      message =
        "This bot was created by Auhn_ using Node.js and Twitch's API.  It may still be buggy KEKW.";
      client.say(target, `@${user}, ${message}`);
    } else if (commandName === "!delcmd" && mod_status === true) {
      if (commandList.includes(input)) {
        client.say(target, `@${user}, ${input} cannot be deleted`);
      } else {
        db.run(
          "DELETE FROM " +
            process.env.TABLE_NAME +
            " WHERE " +
            process.env.COL1 +
            "=(?)",
          input,
          (err) => {
            if (err) {
              return console.log(err.message);
            } else {
              const index = cmd_list.indexOf(input);
              if (index > -1) {
                cmd_list.splice(index, 1);
                console.log(cmd_list);
              }

              client.say(target, `@${user}, ${input} was deleted`);
            }
          }
        );
      }
    } else if (
      (commandName === "!changetitle" || commandName === "!changegame") &&
      mod_status === true
    ) {
      if (commandName === "!changetitle") {
        label = "title";
      } else if (commandName === "!changegame") {
        label = "game_id";
        const result = await getInfo(URL, pathGame, input);
        console.log(result);
        input = result.data[0].id;
      }

      const result = await getInfo(URL, pathInfo, ch_name);
      const id = result.data[0].id;
      await changeTitle(input, pathTitle, id, label);
      console.log(`* Executed ${commandName} command`);
    } else if (commandName === "!commands") {
      let command_str = "";
      for (let i = 0; i < cmd_list.length - 1; i++) {
        command_str += cmd_list[i] + ", ";
      }
      command_str += cmd_list[cmd_list.length - 1] + ".";
      client.say(target, `@${user}, ` + command_str);
    } else if (commandName === "!hiddencommands") {
      for (let i = 0; i < hiddencommandList.length; i++) {
        console.log(hiddencommandList[i]);
      }
    } else if (commandName === "!gameinfo") {
      const result = await getInfo(URL, pathGame, input);
      console.log(result);
      console.log(`* Executed ${commandName} command`);
    } else if (commandName === "!info") {
      const result = await getInfo(URL, pathInfo, ch_name);
      console.log(result);
      console.log(`* Executed ${commandName} command`);
    } else if (commandName === "!id") {
      const result = await getInfo(URL, pathInfo, input);
      const id = result.data[0].id;
      console.log(input + " id: " + id);
      console.log(`* Executed ${commandName} command`);
    } else if (commandName === "!title") {
      const result = await getInfo(URL, pathInfo, ch_name);
      const id = result.data[0].id;
      const result2 = await getInfo(URL, pathTitle, id);
      const title = result2.data[0].title;
      console.log(title);
      client.say(target, `@${user}, The title is: ` + title);
      console.log(`* Executed ${commandName} command`);
    } else {
      db.get(
        "SELECT " +
          process.env.COL2 +
          " FROM " +
          process.env.TABLE_NAME +
          " WHERE " +
          process.env.COL1 +
          "=(?)",
        commandName,
        (err, data) => {
          if (err) {
            return console.log(err.message);
          } else if (cmd_list.includes(commandName)) {
            const cmd_text = Object.values(data)[0];
            client.say(target, cmd_text);
          } else {
            client.say(target, `@${user}, Invalid does not exist`);
          }
        }
      );
    }
  } catch (e) {
    console.log("ERROR: " + e);
  }
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
  console.log(`* Connected to ${addr}:${port} on channels:`);
  for (let i = 0; i < opts.channels.length; i++) {
    console.log(opts.channels[i] + " ");
  }
}

// changes the title of a channel
function changeTitle(title, path, id, label) {
  let d = {};
  switch (label) {
    case "game_id":
      d["game_id"] = title;
      break;
    case "title":
      d["title"] = title;
      break;
  }
  d = JSON.stringify(d);

  const options = {
    hostname: URL,
    path: path + id,
    method: "PATCH",
    // requires OAUTH
    headers: {
      Authorization: "Bearer " + oauth,
      "Client-id": process.env.TWITCH_CLIENTID,
      "Content-Type": "application/json",
      "Content-Length": d.length,
    },
  };
  return new Promise((res, rej) => {
    const req = https.request(options, (response) => {
      console.log(options);
      response.on("data", (data) => {
        const result = JSON.parse(data);
        console.log(result);
        res(result);
      });
    });
    req.on("error", rej);
    req.write(d);
    req.end();
  });
}

// function get_all(query){
//     let new_list = commandList;
//     return new Promise((res, rej) => {
//         db.all(query, (err, rows) => {
//             if(err){return rej(err);}
//             // how is commandList being updated???

//             // for some reason keeps adding things from the database each time
//             for(let i = 0; i < Object.keys(rows).length; i++){
//                 new_list.push(rows[i].cmd_name);
//             }
//             console.log('fak:');
//             console.log(new_list);
//             res(new_list.sort());
//         });
//     });
// }
function get_all(query) {
  return new Promise((res, rej) => {
    db.all(query, (err, rows) => {
      if (err) {
        return rej(err);
      }
      // how is commandList being updated???
      let new_list = [
        "!addcmd",
        "!bot",
        "!changegame",
        "!changetitle",
        "!commands",
        "!delcmd",
        "!dice",
        "!title",
      ];
      //console.log(rows);
      rows.forEach((row) => new_list.push(row.cmd_name));
      res(new_list.sort());
    });
  });
}

// returns information of a channel
function getInfo(URL, path, x) {
  // console.log(path + encodeURI(x));
  const options = {
    hostname: URL,
    path: path + encodeURI(x),
    headers: {
      Authorization: "Bearer " + oauth,
      "Client-id": process.env.TWITCH_CLIENTID,
    },
  };
  return new Promise((res, rej) => {
    const req = https.request(options, (response) => {
      response.on("data", (data) => {
        const result = JSON.parse(data);
        res(result);
      });
    });
    req.on("error", rej);
    req.end();
  });
}

// // checks if user is mod
// //  THIS IS USELESS
// function isMod(user, list){
//     let mod = [];
//     for(let i = 0; i < list.length; i++){
//         mod.push(list[i].user_login);
//     }
//     console.log(mod);
//     if (mod.includes(user)){
//         return true;
//     }
//     return false;
// }

// Function called when the "dice" command is issued
function rollDice(sides) {
  console.log(sides);
  return Math.floor(Math.random() * sides) + 1;
}
