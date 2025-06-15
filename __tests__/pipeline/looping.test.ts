import { v4 as uuid } from "uuid";
import { detectLoop, LoopError } from "../../src/utilities";
import { ChatGPT } from "../ChatGPT";

describe( "pipeline.looping", () => {
  it( "should find loop", async () => {
    const uuids = Array.from( { length: 10 }, () => uuid() );
    const tests: { ids: string[], loop: boolean; }[] = [
      {
        ids: [ "a", "b", "c", "1", "2", "3", "4", "1", "2", "3", "4" ],
        loop: true
      },
      {
        ids: [ "1", "2", "a", "b", "c", "d", "a", "b", "c", "d" ],
        loop: true
      },
      {
        ids: [ uuids[ 0 ], uuids[ 5 ], ...uuids, ...uuids.slice( 0, 3 ) ],
        loop: false
      },
      {
        ids: [ uuids[ 0 ], uuids[ 6 ], ...uuids, ...uuids ],
        loop: true
      }
    ];
    for ( const { ids, loop } of tests ) {
      const result = detectLoop( ids, 4 );
      expect( result.loop ).toBe( loop );
    }
  } );

  it( "should cause a loop error", async () => {
    const chat = new ChatGPT( { model: "gpt-4o-mini" }, { settings: { maxCallStack: 3 } } );
    const promise = chat
      .append( () => {
        return {
          context: "generate a JSON Array of city names"
        };
      }, "1" )
      .moveTo( { id: "1" } )
      .execute();
    expect( promise ).rejects.toThrow( LoopError );
  } );
} );
