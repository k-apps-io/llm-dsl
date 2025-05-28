import { DSL } from "../src/DSL";
import { ChatGPT, Options } from "./ChatGPT";

describe( "arguments", () => {
  it( "should exit triage b/c locals.jira is not defined", async () => {
    interface Locals extends Record<string, any> {
      jira?: string;
    }
    const chat = new DSL<Options, Locals, undefined>( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
      locals: {}
    } );

    await chat.pause( ( { chat: $chat, locals } ) => {
      return new Promise<void>( ( ok ) => {
        if ( !locals.jira ) {
          $chat.exit( new Error( "Jira is not defined" ) );
        }
        ok();
      } );
    } ).prompt( ( { locals } ) => ( {
      content: `Please triage the following Jira issue: ${ locals.jira }`
    } ) )
      .execute()
      .then( () => {
        throw new Error( "This should not be reached" );
      } )
      .catch( ( e ) => {
        expect( e.message ).toBe( "Jira is not defined" );
      } );
  } );

  it( "should execute with args inline", async () => {
    interface Locals extends Record<string, any> {
      jira?: string;
    }
    const chat = new DSL<Options, Locals, undefined>( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
    } );

    await chat
      .setLocals( { jira: "JIRA-1234" } )
      .pause( ( { chat: $chat, locals } ) => {
        return new Promise<void>( ( ok ) => {
          if ( !locals.jira ) {
            $chat.exit( new Error( "Jira is not defined" ) );
          }
          ok();
        } );
      } )
      .prompt( ( { locals } ) => ( {
        content: `Please triage the following Jira issue: ${ locals.jira }`
      } ) )
      .execute();
    const messages = chat.data.messages;
    expect( messages.length ).toBe( 2 );
  } );

  it( "should pass args on execute", async () => {
    interface Locals extends Record<string, any> {
      jira: string;
    }
    interface Metadata extends Record<string, any> {
      jira: string;
    }
    const chat = new DSL<Options, Locals, Metadata>( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
    } );

    chat.pause( ( { chat: $chat, locals } ) => {
      return new Promise<void>( ( ok ) => {
        if ( !locals.jira ) {
          $chat.exit( new Error( "Jira is not defined" ) );
        }
        ok();
      } );
    } )
      .prompt( ( { locals } ) => ( {
        content: `Please triage the following Jira issue: ${ locals.jira }`
      } ) );

    const clonedChat = chat.clone( { startAt: "beginning" } );
    await clonedChat.execute( { locals: { jira: "JIRA-1234" }, metadata: { jira: "JIRA-1234" } } );
    const messages = clonedChat.data.messages;
    expect( messages.length ).toBe( 2 );
    expect( clonedChat.locals.jira ).toBe( "JIRA-1234" );
    expect( messages[ 0 ].content ).toBe( "Please triage the following Jira issue: JIRA-1234" );
    expect( messages[ 0 ].role ).toBe( "user" );
    expect( messages[ 1 ].role ).toBe( "assistant" );
    expect( clonedChat.data.metadata.jira ).toBe( "JIRA-1234" );
  } );
} );