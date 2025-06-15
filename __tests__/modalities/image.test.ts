import OpenAI from "openai";
import { ImageGenerateParams } from "openai/resources";
import sharp from "sharp";
import { localFileStorage, localFileStream } from "../../src/Stream";
import { ChatGPT, ToolResults } from "../ChatGPT";
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

  it( "should generate a image from a prompt", async () => {
    const $chat = chat.clone();
    await $chat
      .prompt( {
        prompt: {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Generate an image of a futuristic cityscape at night with neon lights.',
            }
          ],
        }
      } )
      .tool<{
        prompt: string;
        n?: number;
        size?: ImageGenerateParams[ "size" ];
      }>( {
        name: "image_generation",
        description: "Generate an image based on a prompt.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The prompt to generate the image from.",
              example: "Generate an image of a futuristic cityscape at night with neon lights."
            },
            n: {
              type: "integer",
              description: "The number of images to generate.",
              example: 1
            },
            size: {
              type: "string",
              description: "The size of the generated image.",
              example: "1024x1024"
            }
          },
          required: [ "prompt", "n", "size" ]
        },
        func: ( { prompt, n = 1, size = "1024x1024", tool_call_id } ) => {
          return new Promise<ToolResults>( ( resolve, reject ) => {
            const openai = new OpenAI();
            openai.images.generate( {
              prompt, n, size
            } )
              .then( ( { data } ) => {
                if ( !data ) {
                  resolve( {
                    role: "tool",
                    tool_call_id: tool_call_id!,
                    content: [
                      {
                        type: "text",
                        text: "No image generated."
                      }
                    ]
                  } );
                } else {
                  resolve( {
                    role: "tool",
                    tool_call_id: tool_call_id!,
                    content: data.map( ( image ) => ( {
                      type: "text",
                      text: `Generated image URL: ${ image.url }`
                    } ) )
                  } );
                }
              } )
              .catch( error => {
                const a = false;
                resolve( {
                  role: "tool",
                  tool_call_id: tool_call_id!,
                  content: [
                    {
                      type: "text",
                      text: `Error generating image: ${ error.message }`
                    }
                  ]
                } );
              } );
          } );
        }
      } )
      .pipe(
        localFileStream( { directory: __dirname, filename: "generated-image.response" } )
      ).execute();
    localFileStorage( { directory: __dirname, chat: $chat, filename: "generated-image.response" } );
  }, 60000 );
} );
