import * as appsyncRequest from "./appsyncRequest.mjs";

export const handler = async (event) => {
  const id = event && event.detail && event.detail.id;
  console.log(event)
  if (undefined === id || null === id) throw new Error("Missing argument 'id'");
  try {
    const variables = {
      id: id
    }
    const response = await appsyncRequest.handler(variables);
    console.log("okay"+response)
    return response
  } catch (error) {
    return error;
  }
}