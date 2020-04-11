const queryMessage = `query send_message($message:String!, $plugins:PluginMaster!) {
  send_message(message: $message, plugins: $plugins) {
    plugin
    errors {
      error
      message
    }
  }
}`;

const areasQuery = () => `
    query {
        areas(start: 0) {
            id
            name
        }
    }
`

module.exports = {
    queryMessage, 
    areasQuery
}