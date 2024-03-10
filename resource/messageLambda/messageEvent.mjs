import * as appsyncRequest from "./appsyncRequest.mjs";

export const handler = async (event) => {
  console.log(event)
  for (const message of event.Records) {
    await processMessageAsync(message);
  }
  console.info("done");
};

async function processMessageAsync(message) {
  console.log(message);
  const eventName = message['eventName'];
  const item =  message['dynamodb']['NewImage']
  if(eventName == 'INSERT'){
    const variables = {
      input: {
        RoomId: item['RoomId']['S'],
        MessageId: item['MessageId']['S'],
        AuthorId: item['AuthorId']['S'],
        Content: item['Content']['S'],
        CreatedTime: item['CreatedTime']['S'],
      }
    }
    return await appsyncRequest.handler(variables);
  }
}