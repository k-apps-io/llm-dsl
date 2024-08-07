import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals } from "../../src/DSL";
import { LocalStorage } from "../../src/Storage";
import { localFileStorage, localFileStream } from "../../src/Stream";
interface ChatLocals extends Locals {
  wasCalled: boolean;
}
const chat = new DSL<Options, ChatLocals, undefined>( {
  llm: new ChatGPT( {
    model: "gpt-3.5-turbo",
  } ),
  storage: LocalStorage( { directory: __dirname } ),
  locals: {
    wasCalled: false
  }
} );
describe( ".function", () => {
  it( 'expectFunctionCall', async () => {
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
              message: `here is the current weather report \`\`\`json ${ JSON.stringify( weather ) }\`\`\``,
              functions: false
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
      .stream( localFileStream( { directory: __dirname, filename: 'function' } ) );
    localFileStorage( { directory: __dirname, chat: $chat, filename: 'function' } );
    expect( $chat.locals.wasCalled ).toBeTruthy();
  }, 60000 );

  it( 'callsFunction', async () => {
    const $chat = await chat
      .clone()
      .function( {
        name: "myFunction",
        parameters: {
          "type": "object",
          "properties": {}
        },
        description: "a function available on the DSL",
        func: ( { locals, chat: $this } ) => {
          return new Promise( ( resolve, reject ) => {
            locals.wasCalled = true;
            resolve( {
              message: `hello`,
              functions: false
            } );
          } );
        }
      } )
      .call( "myFunction" )
      .stream( localFileStream( { directory: __dirname, filename: 'callsFunction' } ) );
    localFileStorage( { directory: __dirname, chat: $chat, filename: 'callsFunction' } );
    expect( $chat.locals.wasCalled ).toBeTruthy();
  } );
} );