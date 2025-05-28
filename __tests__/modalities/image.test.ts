import sharp from "sharp";
import { DSL } from "../../src/DSL";
import { localFileStream } from "../../src/Stream";
import { ChatGPT, Options } from "../ChatGPT";
const chat = new DSL<Options, any, undefined>( {
  llm: new ChatGPT( { model: "gpt-4o-mini" } ),
} );

describe( "Modality", () => {
  it( "should describe the image", async () => {
    const mimeType = "image/png";
    const imagePath = `${ __dirname }/image_01.png`;
    const imageBuffer = await sharp( imagePath ).resize( 100 ).toBuffer();
    const base64Image = imageBuffer.toString( "base64" );
    await chat
      .clone()
      .prompt( {
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
      } )
      .stream(
        localFileStream( { directory: __dirname, filename: "image.response" } )
      );
  }, 60000 );

  it( "should describe the image to build a react component", async () => {
    const mimeType = "image/png";
    const imagePath = `${ __dirname }/image_02.png`;
    const imageBuffer = await sharp( imagePath ).toBuffer();
    const base64Image = imageBuffer.toString( "base64" );
    await chat
      .clone()
      .prompt( {
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
      } )
      .stream(
        localFileStream( { directory: __dirname, filename: "image-to-react.response" } )
      );
  }, 60000 );
} );
