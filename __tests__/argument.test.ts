import { LLM } from "../src";
import { ChatGPT } from "./ChatGPT";

describe( "arguments", () => {
  it( "should exit triage b/c locals.jira is not defined", async () => {
    interface Locals extends LLM.Locals {
      jira?: string;
    }
    const chat = new ChatGPT<Locals>( { model: "gpt-4o-mini" } );

    await chat.pause( ( { chat: $chat, locals } ) => {
      return new Promise<void>( ( ok ) => {
        if ( !locals.jira ) {
          $chat.exit( new Error( "Jira is not defined" ) );
        }
        ok();
      } );
    } ).prompt( ( { locals } ) => ( {
      prompt: {
        role: "user",
        content: `Please triage the following Jira issue: ${ locals.jira }`
      }
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
    interface Locals extends LLM.Locals {
      jira?: string;
    }
    const chat = new ChatGPT<Locals>( { model: "gpt-4o-mini" } );

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
        prompt: {
          role: "user",
          content: `Please triage the following Jira issue: ${ locals.jira }`
        }
      } ) )
      .execute();
    const messages = chat.data.messages;
    expect( messages.length ).toBe( 2 );
  } );

  it( "should pass args on execute", async () => {
    interface Locals extends LLM.Locals {
      jira: string;
    }
    interface Metadata extends LLM.Metadata {
      jira: string;
    }
    const chat = new ChatGPT<Locals, Metadata>( { model: "gpt-4o-mini" } );

    chat.pause( ( { chat: $chat, locals } ) => {
      return new Promise<void>( ( ok ) => {
        if ( !locals.jira ) {
          $chat.exit( new Error( "Jira is not defined" ) );
        }
        ok();
      } );
    } )
      .prompt( ( { locals } ) => ( {
        prompt: {
          role: "user",
          content: `Please triage the following Jira issue: ${ locals.jira }`
        }
      } ) );

    const clonedChat = chat.clone( { startAt: "beginning" } );
    await clonedChat.execute( { locals: { jira: "JIRA-1234" }, metadata: { jira: "JIRA-1234" } } );
    const messages = clonedChat.data.messages;
    expect( messages.length ).toBe( 2 );
    expect( clonedChat.locals.jira ).toBe( "JIRA-1234" );
    expect( clonedChat.data.metadata.jira ).toBe( "JIRA-1234" );
  } );
} );