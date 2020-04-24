const queryMessage = `query send_message($message:String!, $plugins:PluginMaster!) {
  send_message(message: $message, plugins: $plugins) {
    plugin
    errors {
      error
      message
    }
  }
}`;

const tagsQuery = () => `
    query {
        tags(start: 0) {
            name
            slug
        }
    }
`
   

const areasQuery = () => `
    query {
        areas(start: 0) {
            name
            mapgt_slug
        }
    }
`

module.exports = {
    queryMessage, 
    tagsQuery,
    areasQuery
}