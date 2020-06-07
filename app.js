require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const { createEventAdapter } = require('@slack/events-api');
const { createMessageAdapter } = require('@slack/interactive-messages');
const fetch = require('node-fetch');
const dateformat = require('dateformat');
const express = require('express');
const morgan = require('morgan');
const chalk = require('chalk');
const { modalJson, homeJson, unauthorizedHomeJsonBlocks, homeJsonBlocks, successJson, failureJson} = require('./views.js');
const { queryMessage, tagsQuery, areasQuery} = require('./queries.js');
const { authorizedUsers } = require('./authorizedUsers');

const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const slackInteractions = createMessageAdapter(process.env.SLACK_SIGNING_SECRET);

const app = express();
const PORT = 80;

async function makeCMSRequest(query, variables = {}, token = "") {
    headers = {
        "Content-Type": `application/json`,
        Accept: `application/json`
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }
    const res = await fetch(process.env.CMS_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            query: query,
            variables: variables
        })
    })
    return res;
}

async function makeRequest(message, clientSchemaJson, adminkey) {
    ret = failureJson()
    const res = await fetch(process.env.BUZZER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': `application/json`,
            'Accept'      : `application/json`,
            'Authorization': 'Basic ' + adminkey
        },
        body: JSON.stringify({
            query: queryMessage,
            variables: {
                "message": message,
                "plugins": clientSchemaJson
            }
        })
    }).then(res => {
        if (res.status == 200) {
            console.log("Buzzer Success")
            ret = successJson();
        } else {
            console.log("My name is rahul and im dumb")            
        }
        return res.json()
    }).then(res => {
        console.log("response received")
        console.log(JSON.stringify(res))
    }) 
    return ret;
}

// Slack will not display options data if text or value is greater than 75 characters so it must be shortened
String.prototype.trunc = String.prototype.trunc ||
    function (n) {
        return (this.length > n) ? this.substr(0, n - 1) + '...' : this;
    };
String.prototype.capitalize = String.prototype.capitalize ||
    function () {
        return this.charAt(0).toUpperCase() + this.slice(1);
    };

app.use(morgan(function (tokens, req, res) {
    var status = tokens.status(req, res)
    var statusColor = status >= 500
        ? 'red' : status >= 400
            ? 'yellow' : status >= 300
                ? 'cyan' : 'green'

    return chalk.reset(tokens.method(req, res) + ' ' + tokens.url(req, res))
        + ' ' + chalk[statusColor](status)
        + ' ' + chalk.reset(tokens['response-time'](req, res) + ' ms')
}))


app.use('/slack/events', slackEvents.requestListener())

slackEvents.on('message', (event) => {
    console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);
})

slackEvents.on('app_home_opened', async (event) => {
    console.log("Setting home");
    console.log(process.env.SLACK_BOT_TOKEN)
    const res = await web.views.publish(homeJson(event.user));
    if (authorizedUsers.map(user => user.id).includes(event.user)) {
        console.log('authorized')
        const res = await web.views.publish(homeJson(event.user));
    } else {
        console.log('nah')
        const res = await web.views.publish(unauthorizedHomeJson(event.user));
    }
})

slackEvents.on('error', console.error);

app.use('/slack/actions', slackInteractions.requestListener());

slackInteractions.action({type: 'multi_static_select'}, async (payload) => {
    console.log('Platform(s) selected; Updating modal');
    let selected_platforms = payload.actions[0].selected_options;
    for (let p in selected_platforms) {
        console.log(selected_platforms[p].value);
    }
    const res = await web.views.open(modalJson(payload.trigger_id, selected_platforms));
})

slackInteractions.options({ actionId: 'mobile_tag' }, (payload) => {
    console.log('Getting tags');

    return getTags().catch(console.error);
})

slackInteractions.options({ actionId: 'mapgt_location' }, (payload) => {
    console.log('Getting areas');

    return getAreas().catch(console.error);
})

slackInteractions.options({actionId: 'slack_channels'}, (payload) => {
    console.log('Getting channels');

    return getConversations(payload.value).catch(console.error);
})

slackInteractions.viewSubmission('buzzer_submit', async (payload) => {
    console.log('Buzzer notification(s) created');
    let clients = getClients(payload.view.blocks);
    let values = payload.view.state.values;
    values = [...new Set(values)];
    let clientSchema = await generateSchema(clients, values);
    console.log(JSON.stringify(clientSchema))
    let clientSchemaJson = {}
    clientSchema.map(client => {
        let index = Object.keys(client)[0];
        clientSchemaJson[index] = client[index];
    })
    const ret = await makeRequest(values.none1.message.value, clientSchemaJson, process.env.ADMIN_KEY_SECRET);
    return ret;
})

async function generateSchema(clients, values) {
    schema = [];
    for (let c in clients) {
        if (clients[c] == 'live_site') {
            schema.push(
                {
                    "live_site": {
                        "title": values.live_site.live_site_title.value
                        // "icon": values.none4.live_site_icon.value || null
                    }
                }
            )
        }
        else if (clients[c] == 'twitter') {
            schema.push(
                {
                    "twitter": {
                        "_": true
                    }
                }
            )
        }
        else if (clients[c] == 'slack') {
            selected_options = values.none10.slack_at.selected_options;
            let at_channel = false
            let at_here = false
            for (let o in selected_options) {
                if (selected_options[o].value == 'channel') {
                    at_channel = true;
                }
                if (selected_options[o].value == 'here') {
                    at_here = true;
                }
            }
            schema.push(
                {
                    "slack": {
                        "channels": values.slack.slack_channels.selected_options.map(channel => channel.value),
                        "at_channel": at_channel,
                        "at_here": at_here
                    }
                }
            )
        }
        else if (clients[c] == 'mobile') {
            schema.push(
                {
                    "f_c_m": {
                        "header": values.mobile.mobile_header.value,
                        "id": values.none13.mobile_tag.selected_option.value || null
                    }
                }
            )
        }
        else if (clients[c] == 'mapgt') {
            schema.push(
                {
                    "mapgt": {
                        "area": values.mapgt.mapgt_location.selected_option.value || null,
                        "title": values.none16.mapgt_title.value,
                        "time": values.none17.mapgt_time.selected_option.value
                    }
                }
            )
        }
    }
    return schema
}

function getClients(blocks) {
    let clients = [];
    for (let b in blocks) {
        if (!blocks[b].block_id.includes('none')) {
            clients.push(blocks[b].block_id);
        }
    }
    return clients;
}

async function getConversations(query) {
    const result = await web.conversations.list({
        token: process.env.SLACK_BOT_TOKEN,
        exclude_archived: true,
        limit: 258
    });
    convos = await saveChannels(result.channels);
    convos = convos.filter((event) => {
        return event.toLowerCase().replace(/\s/g, '').includes(query.toLowerCase().replace(/\s/g, ''));
    });
    console.log("Fetched channels data")
    let options = {
        "options": []
    };
    for (c of convos) {
        options.options.push({
            text: {
                type: "plain_text",
                text: "#" + c
            },
            value: c
        })
    }
    return options;
}

async function saveChannels(conversationsArray) {
    convos = [];
    conversationsArray.forEach(function(conversation){
        convos.push(conversation["name"])
    });
    return convos
}

async function getTags() {
    const res = await makeCMSRequest(tagsQuery());

    console.log("Fetched tags data");

    let data = await res.json();

    if (data.errors) {
        console.error(data.errors);
        return [];
    } else if (!data.data.tags) {
        return [];
    }

    data = data.data.tags;

    let options = {
        "options": []
    };

    for (tag of data) {
        if (!tag.slug) {
            continue
        }
        options.options.push({
            text: {
                type: "plain_text",
                text: tag.name
            },
            value: tag.slug
        })
    }
    return options;
}

async function getAreas() {
    const res = await makeCMSRequest(areasQuery());

    console.log("Fetched areas data");

    let data = await res.json();

    if (data.errors) {
        console.error(data.errors);
        return [];
    } else if (!data.data.areas) {
        return [];
    }

    data = data.data.areas;

    let options = {
        "options": []
    };

    for (area of data) {
        if (!area.mapgt_slug) {
            continue
        }
        options.options.push({
            text: {
                type: "plain_text",
                text: area.name
            },
            value: area.mapgt_slug
        })
    }
    return options;
}

app.use(express.urlencoded({ extended: true }));

app.post('/slack/slashcommand', (req, res) => {
    console.log("slackcommand")
    if (authorizedUsers.map(user => user.id).includes(req.body.user_id)) {
        console.log("sending home block")
        res.json({ "blocks": homeJsonBlocks() });
    } else {
        res.json({ "blocks": unauthorizedHomeJsonBlocks() });
    }
})

app.get('/*', (req, res) => {
    res.send("Default get");
    console.log('Loading get');
})

app.post('/*', (req, res) => {
    res.send("Default post");
    console.log('Loading post');
})

app.listen(process.env.PORT || PORT, function() {
    console.log('App is listening on port ' + PORT);
  });
