import { LLM, localFileStream } from "../../src";
import { ChatGPT } from "../ChatGPT";
import { getRandomNumber } from "../utilities";

const chat = new ChatGPT( { model: "gpt-4o-mini" } );

describe( "push", () => {

  /**
   * this is a simple test that proves the order of which the messages
   * added from a push stage is maintained in the chat data.
   */
  it( "should push 2 messages to beginning of the chat", async () => {
    const $chat = chat.clone();
    await $chat
      .push( {
        key: "1",
        context: "this is the first message"
      } )
      .push( {
        key: "2",
        context: "this is the second message"
      } )
      .pipe( localFileStream( { directory: __dirname, filename: 'pushing2' } ) )
      .execute();

    const actual = $chat.data.messages
      .filter( m => m.type === "context" )
      .map( m => m.key );
    const expected = [ "1", "2" ];
    expect( actual ).toMatchObject( expected );
  } );

  /**
   * similar to the prior test, however we validate against a random number
   * of messages to ensure the order is maintained
   */
  it( "should push many messages to the chat", async () => {
    const $chat = chat.clone();
    const num = getRandomNumber( 3, 10 );
    for ( let index = 0; index <= num; index++ ) {
      $chat.push( {
        key: String( index ),
        context: `this is message #${ index }`
      } );
    }
    await $chat
      .pipe( localFileStream( { directory: __dirname, filename: 'pushingRandomized' } ) )
      .execute();
    const acutal = $chat.data.messages
      .filter( m => m.type === "context" )
      .map( m => m.key );
    const expected = Array.from( { length: num + 1 }, ( _, index ) => String( index ) );
    expect( acutal ).toMatchObject( expected );
  } );

  /**
   * this test is to validate that pushing messages around a prompt maintains
   * the order in the chat data
   */
  it( "should push 2 messages around a prompt", async () => {
    const $chat = chat.clone();
    await $chat
      .push( {
        key: "1",
        context: "today is not a good day"
      } )
      .prompt( {
        key: "2",
        prompt: {
          role: "user",
          content: "Can you tell me a joke to cheer me up?"
        }
      } )
      .push( {
        key: "3",
        context: "that was funny"
      } )
      .pipe( localFileStream( { directory: __dirname, filename: 'promptingWithPush' } ) )
      .execute();

    const actual = $chat.data.messages
      .filter( m => m.type === "context" || m.type === "prompt" )
      .map( m => m.key );
    const expected = [ "1", "2", "3" ];
    expect( actual ).toMatchObject( expected );
  } );


  /**
   * this test is to validate that pushing a message maintains the order
   * around a forEach stage
   */
  it( "should push messages around a forEach prompt", async () => {
    const $chat = chat.clone();
    await $chat
      .push( {
        key: "1",
        context: "Please reverse the order of the characters for the following value"
      } )
      .forEach( [ "Jon Snow", "Game of Thrones" ], ( { chat, item } ) => {
        chat.prompt( {
          key: item,
          prompt: {
            role: "user",
            content: item
          }
        } );
      } )
      .append( {
        key: "3",
        context: "the final message"
      } )
      .pipe( localFileStream( { directory: __dirname, filename: 'promptForEach' } ) )
      .execute();

    const actual = $chat.data.messages
      .filter( m => m.type === "context" || m.type === "prompt" )
      .map( m => m.key );
    const expected = [ "1", "Jon Snow", "Game of Thrones", "3" ];
    expect( actual ).toMatchObject( expected );
  }, 60000 );


  /**
   * this test is to validate that appending a message maintains the order
   * around a prompt for each
   */
  it( "should push within a forEach", async () => {
    const $chat = chat.clone();
    const testWords: string[] = [
      "Jon Snow",
      "Game of Thrones",
      "Danareas Targarian"
    ];
    await $chat
      .push( {
        key: "1",
        context: "reverse the order of the characters of the following value."
      } )
      .forEach( testWords, ( { chat, item, index } ) => {
        chat.prompt( {
          key: item,
          prompt: {
            role: "user",
            content: item
          }
        } )
          .push( {
            key: `pushedMessage-${ index }`,
            context: "Thanks",
            visibility: LLM.Visibility.EXCLUDE
          } );
      } )
      .pipe( localFileStream( { directory: __dirname, filename: 'forEach', append: false } ) )
      .execute();
    const actual = $chat.data.messages
      .filter( m => m.type === "prompt" || m.type === "context" )
      .map( m => m.key );

    const expected = [
      "1",
      ...testWords.flatMap( ( word, index ) => [ word, `pushedMessage-${ index }` ] ),
    ];
    expect( actual ).toMatchObject( expected );
  }, 60000 );

  it( "should push a message within a pause stage", async () => {
    const $chat = chat.clone();
    await $chat
      .pause( ( { chat: $this } ) => new Promise<void>( ( resolve, reject ) => {
        $this.push( {
          context: "this was pushed within a pause",
        } );
        resolve();
      } ) )
      .pipe( localFileStream( { directory: __dirname, filename: 'pushingWithinPause' } ) )
      .execute();
    const actual = ( $chat.data.messages
      .filter( m => m.type === "context" ) as LLM.Message.Context[] )
      .map( m => m.context );
    const expected = [ "this was pushed within a pause" ];
    expect( actual ).toMatchObject( expected );
    const expectedStages = [
      "pause",
      "push"
    ];
    const actualStages = $chat.pipeline.map( stage => stage.stage );
    expect( actualStages ).toMatchObject( expectedStages );
  } );

  it( "should push a message within a pause stage in the middle of a pipeline", async () => {
    const $chat = chat.clone();
    await $chat
      .rule( {
        name: "Test Rule",
        requirement: "Test",
      } )
      .pause( ( { chat: $this } ) => new Promise<void>( ( resolve, reject ) => {
        $this.push( {
          context: "this was pushed within a pause",
        } );
        resolve();
      } ) )
      .pipe( localFileStream( { directory: __dirname, filename: 'pushingWithinPause' } ) )
      .execute();

    const actual = ( $chat.data.messages
      .filter( m => m.type === "context" ) as LLM.Message.Context[] )
      .map( m => m.context );
    const expected = [ "this was pushed within a pause" ];
    expect( actual ).toMatchObject( expected );

    const expectedStages = [
      "rule",
      "pause",
      "push"
    ];
    const actualStages = $chat.pipeline.map( stage => stage.stage );
    expect( actualStages ).toMatchObject( expectedStages );
  } );

} );