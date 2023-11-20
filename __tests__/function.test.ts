import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";
import { createWriteStream } from "fs";
import { DSL } from "../src/DSL";
import { LocalStorage } from "../src/Storage";

const chat = new DSL<Options, { wasCalled: boolean; }>( {
  llm: new ChatGPT( {
    timeout: 10000
  }, "gpt-3.5-turbo" ),
  storage: LocalStorage,
  options: {
    model: "gpt-3.5-turbo",
  },
  metadata: {},
  locals: {
    wasCalled: false
  }
} );
describe( ".function", () => {
  it( 'expectFunctionCall', async () => {
    const fileStream = createWriteStream( `./__tests__/expectFunctionCall.log` );
    const $chat = await chat
      .clone()
      .function<{ unit?: "Fahrenheit" | "Celsius"; }>( {
        name: "getTheCurrentWeather",
        parameters: {
          "type": "object",
          "properties": {
            "unit": {
              "type": "string",
              "enum": [ "Fahrenheit", "Celsius" ]
            }
          }
        },
        description: "helps the AI model determine the current weather",
        func: ( { unit = "Fahrenheit", locals, chat: $this } ) => {
          return new Promise( ( resolve, reject ) => {
            locals.wasCalled = true;
            const weather = {
              temperature: unit === "Fahrenheit" ? 24 : 5,
              unit: unit,
              percipitation: "it's snowing"
            };
            resolve( {
              message: `here is the current weather report \`\`\`json ${ JSON.stringify( weather ) }\`\`\``
            } );
          } );
        }
      } )
      .rule( {
        name: "Temperature",
        requirement: "all temperature readings must be in Celsius"
      } )
      .prompt( {
        message: "what's the weather like today?",
        function_call: { name: "getTheCurrentWeather" }
      } )
      .response( ( { response, locals, chat: $this } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          if ( !locals.wasCalled ) {
            reject( "function did not executed" );
            return;
          }
          resolve();
        } );
      } )
      .stream( chunk => {
        if ( chunk.type === "chat" ) fileStream.write( `// chat: ${ chunk.id } - ${ chunk.state }` );
        if ( chunk.type === "command" ) fileStream.write( `\n${ chunk.content }\n` );
        if ( ( chunk.type === "message" && chunk.state === "streaming" ) ) fileStream.write( chunk.content );
      } );
    expect( $chat.locals.wasCalled ).toBeTruthy();
    fileStream.end();
  }, 60000 );
} );