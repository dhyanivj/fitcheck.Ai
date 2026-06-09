const { GoogleAuth } = require('google-auth-library');

async function test() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  
  const projectId = await auth.getProjectId();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
  
  const region = "us-east4"; // from the log
  const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/virtual-try-on-001:predict`;
  
  const payloads = [
    {
      name: "personImage and productImages with image.bytesBase64Encoded",
      data: {
        instances: [
          {
            personImage: { image: { bytesBase64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" } },
            productImages: [ { image: { bytesBase64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" } } ],
          },
        ],
        parameters: { numberOfImages: 1 },
      }
    },
    {
      name: "personImage and productImage with image.bytesBase64Encoded",
      data: {
        instances: [
          {
            personImage: { image: { bytesBase64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" } },
            productImage: { image: { bytesBase64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" } },
          },
        ],
        parameters: { numberOfImages: 1 },
      }
    },
    {
      name: "personImage and productImages with image.imageBytes",
      data: {
        instances: [
          {
            personImage: { image: { imageBytes: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" } },
            productImages: [ { image: { imageBytes: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" } } ],
          },
        ],
        parameters: { numberOfImages: 1 },
      }
    }
  ];

  for (const p of payloads) {
    console.log(`Testing ${p.name}...`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(p.data),
    });
    console.log(res.status, await res.json());
  }
}

test().catch(console.error);
