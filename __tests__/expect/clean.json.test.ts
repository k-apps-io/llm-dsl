import JSON from "json5";
import { cleanJSON } from "../../src/Expect";

describe( "clean.json", () => {
  it( 'should clean fractions from a JSON string', async () => {
    const text = `
    [
        {
          "name": "salt",
          "amount": 1/2,
          "portion": "tsp"
        },
        {
          "name": "black pepper",
          "amount": 1/4,
          "portion": "tsp"
        }
    ]`;
    const cleaned = cleanJSON( text );
    expect( () => JSON.parse( cleaned ) ).not.toThrow();
  } );
} );