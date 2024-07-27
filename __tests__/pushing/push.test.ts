import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { Visibility, localFileStream } from "../../src";
import { DSL } from "../../src/DSL";
import { getRandomNumber } from "../utilities";

const chat = new DSL<Options, any, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

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
        message: "this is the first message"
      } )
      .push( {
        key: "2",
        message: "this is the second message"
      } )
      .stream( localFileStream( { directory: __dirname, filename: 'pushing2' } ) );

    expect( $chat.data.messages[ 0 ].key ).toBe( "1" );
    expect( $chat.data.messages[ 1 ].key ).toBe( "2" );
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
        message: `this is message #${ index }`
      } );
    }
    await $chat
      .stream( localFileStream( { directory: __dirname, filename: 'pushingRandomized' } ) );
    for ( let index = 0; index <= num; index++ ) {
      expect( $chat.data.messages[ index ].key ).toBe( String( index ) );
    }
  } );

  /**
   * this test is to validate that pushing messages around a prompt maintains
   * the order in the chat data
   */
  it( "should push 2 messages around a prompt ", async () => {
    const $chat = chat.clone();
    await $chat
      .push( {
        key: "1",
        message: "today is not a good day"
      } )
      .prompt( {
        key: "2",
        message: "Can you tell me a joke"
      } )
      .push( {
        key: "3",
        message: "that was funny"
      } )
      .stream( localFileStream( { directory: __dirname, filename: 'promptingWithPush' } ) );

    expect( $chat.data.messages[ 0 ].key ).toBe( "1" );
    expect( $chat.data.messages[ 1 ].key ).toBe( "2" );
    // position 2 will be response from the prompt
    expect( $chat.data.messages[ 3 ].key ).toBe( "3" );
  } );


  /**
   * this test is to validate that pushing a message maintains the order
   * around a prompt for each
   */
  it( "should push messages around a promptForEach stage", async () => {
    const $chat = chat.clone();
    await $chat
      .push( {
        key: "1",
        message: "Please reverse the order of the characters for the following value"
      } )
      .promptForEach( () => {
        return [ "Jon Snow", "Game of Thrones" ].map( value => ( {
          message: `${ value }`
        } ) );
      } )
      .push( {
        key: "3",
        message: "the final message"
      } )
      .stream( localFileStream( { directory: __dirname, filename: 'promptForEach' } ) );

    expect( $chat.data.messages[ 0 ].key ).toBe( "1" );
    // position 1-4 will be the prompt and responses respectively
    expect( $chat.data.messages[ 5 ].key ).toBe( "3" );
  } );


  /**
   * this test is to validate that pushing a message maintains the order
   * around a prompt for each
   */
  it( "should push within a branchForEach", async () => {
    const $chat = chat.clone();
    const testWords: string[] = [
      "Jon Snow",
      "Game of Thrones",
      "Danareas Targarian"
    ];
    await $chat
      .push( {
        key: "1",
        message: "reverse the order of the characters of the following value."
      } )
      .branchForEach( () => {
        return testWords.map( value => ( {
          key: "value",
          message: `${ value }`
        } ) );
      } )
      .push( {
        key: "pushedMessage",
        message: "Thanks",
        visibility: Visibility.EXCLUDE
      } )
      .join()
      .stream( localFileStream( { directory: __dirname, filename: 'branchForEach', append: false } ) );

    expect( $chat.data.messages[ 0 ].key ).toBe( "1" );
    for ( let index = 0; index < testWords.length; index++ ) {
      const position = index * 3 + 1;
      expect( $chat.data.messages[ position ].key ).toBe( "value" );
      expect( $chat.data.messages[ position ].content ).toBe( testWords[ index ] );
      expect( $chat.data.messages[ position + 2 ].key ).toBe( "pushedMessage" );
    }
  } );

} );