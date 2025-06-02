import sharp from "sharp";
import { localFileStorage, localFileStream } from "../../src/Stream";
import { ChatGPT } from "../ChatGPT";
const chat = new ChatGPT( { model: "gpt-4o-mini" } );

describe( "Modality", () => {
  it( "describe the image", async () => {
    const mimeType = "image/png";
    const imagePath = `${ __dirname }/image_01.png`;
    const imageBuffer = await sharp( imagePath ).resize( 100 ).toBuffer();
    const base64Image = imageBuffer.toString( "base64" );
    const $chat = chat
      .clone();

    await $chat.prompt( {
      prompt: {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Describe this image in detail.',
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${ mimeType };base64,${ base64Image }`,
              detail: "auto"
            }
          }
        ],
      }
    } )
      .pipe(
        localFileStream( { directory: __dirname, filename: "image.response" } )
      )
      .execute();
    localFileStorage( { directory: __dirname, chat: $chat, filename: "image.response" } );
  }, 60000 );

  it( "use image to build a react component", async () => {
    const mimeType = "image/png";
    const imagePath = `${ __dirname }/image_02.png`;
    const imageBuffer = await sharp( imagePath ).toBuffer();
    const base64Image = imageBuffer.toString( "base64" );
    const $chat = chat
      .clone();

    await $chat
      .prompt( {
        prompt: {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Please review the image from a Figma design file and create a React component that matches the design. Please use Tailwind CSS for styling and Flowbite react if any library components are necessary. Please be sure to match the coloring and font.',
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${ mimeType };base64,${ base64Image }`,
                detail: "auto"
              }
            }
          ],
        }
      } )
      .pipe(
        localFileStream( { directory: __dirname, filename: "image-to-react.response" } )
      ).execute();
    localFileStorage( { directory: __dirname, chat: $chat, filename: "image-to-react.response" } );
  }, 60000 );
} );
