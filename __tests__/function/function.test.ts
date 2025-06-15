import { toCodeBlock } from "../../src";
import { LLM } from "../../src/definitions";
import { LocalStorage } from "../../src/Storage";
import { localFileStorage, localFileStream } from "../../src/Stream";
import { ChatGPT } from "../ChatGPT";

interface ChatLocals extends LLM.Locals {
  wasCalled: boolean;
}
const chat = new ChatGPT<ChatLocals>( {
  model: "gpt-4o-mini",
}, {
  storage: new LocalStorage( { directory: __dirname } ),
  locals: {
    wasCalled: false
  }
} );
describe( ".function", () => {
  it( 'expectFunctionCall', async () => {
    const $chat = await chat
      .clone()
      .tool<{ unit?: "Fahrenheit" | "Celsius"; }>( {
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
        description: "helps the AI model determine the current weather for the users current location",
        func: ( { unit = "Fahrenheit", locals, tool_call_id } ) => {
          return new Promise( ( resolve ) => {
            locals.wasCalled = true;
            const weather = {
              temperature: unit === "Fahrenheit" ? 24 : 5,
              unit: unit,
              percipitation: "it's snowing"
            };
            resolve( {
              role: "tool",
              tool_call_id: tool_call_id || "getTheCurrentWeather",
              content: toCodeBlock( "json", JSON.stringify( weather ) ),
            } );
          } );
        }
      } )
      .rule( {
        name: "Temperature",
        requirement: "all temperature readings must be in Celsius"
      } )
      .prompt( {
        prompt: {
          role: "user",
          content: "what's the weather like today?",
        }
      } )
      .response( ( { locals, chat } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          if ( !locals.wasCalled ) {
            reject( "function did not executed" );
            return;
          }
          resolve();
        } );
      } )
      .pipe( localFileStream( { directory: __dirname, filename: 'expectFunctionCall' } ) )
      .execute();
    localFileStorage( { directory: __dirname, chat: $chat, filename: 'expectFunctionCall' } );
    expect( $chat.locals.wasCalled ).toBeTruthy();
  }, 60000 );

  it( 'callsFunction', async () => {
    const $chat = await chat
      .clone()
      .tool( {
        name: "myFunction",
        parameters: {
          "type": "object",
          "properties": {}
        },
        description: "a function available on the Agent",
        func: ( { locals, tool_call_id } ) => {
          return new Promise( ( resolve, reject ) => {
            locals.wasCalled = true;
            resolve( {
              role: "tool",
              tool_call_id: tool_call_id || "myFunction",
              content: `hello`
            } );
          } );
        }
      } )
      .call( { name: "myFunction" } )
      .pipe( localFileStream( { directory: __dirname, filename: 'callsFunction' } ) )
      .execute();

    localFileStorage( { directory: __dirname, chat: $chat, filename: 'callsFunction' } );
    expect( $chat.locals.wasCalled ).toBeTruthy();
  }, 60000 );
} );