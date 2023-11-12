import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";
import { createWriteStream } from "fs";
import { DSL } from "../src/DSL";
import { LocalStorage } from "../src/Storage";

const chat = new DSL<Options, any>( {
  llm: new ChatGPT( {
    timeout: 10000
  } ),
  storage: LocalStorage,
  options: {
    model: "gpt-3.5-turbo",
  },
  metadata: {}
} );
describe( ".function", () => {
  it( 'expectFunctionCall', async () => {
    const $chat = chat.clone();
    const fileStream = createWriteStream( `./__tests__/expectFunctionCall.log` );
    fileStream.write( `// ../chats/${ $chat.chat.id }.json\n\n` );
    await $chat
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
        func: ( { unit = "Fahrenheit", context, chat: $this } ) => {
          return new Promise( ( resolve, reject ) => {
            $this.context = "it's snowing!";
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
      .response( ( response, context, $this ) => {
        return new Promise<void>( ( resolve, reject ) => {
          if ( context === undefined ) {
            reject( "function did not executed" );
            return;
          }
          $this.context = context.includes( "it's snowing!" ) ? "passed" : "failed";
          resolve();
        } );
      } )
      .stream( chunk => {
        if ( chunk.type === "message" || chunk.type == "command" ) fileStream.write( chunk.content );
      } );
    expect( $chat.context ).toBe( "passed" );
    fileStream.end();
  }, 60000 );
} );