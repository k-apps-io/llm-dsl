import JSON from "json5";
import { cleanJSON } from "../../src/utilities";

describe( "clean.json", () => {
  it( 'should clean fractions from a JSON string', async () => {
    const text = `
    {
      "name": "Mediterranean Stuffed Bell Peppers",
      "description": "Savor the flavors of the Mediterranean with these delicious stuffed bell peppers filled with a mix of veggies, grains, and herbs.",
      "ingredients": [
        {
          "name": "Bell peppers",
          "amount": 4,
          "portion": "whole"
        },
        {
          "name": "Cooked quinoa",
          "amount": 1,
          "portion": "cup"
        },
        {
          "name": "Cherry tomatoes, diced",
          "amount": 1/2,
          "portion": "cup"
        },
        {
          "name": "Cucumber, diced",
          "amount": 1/2,
          "portion": "cup"
        },
        {
          "name": "Red onion, diced",
          "amount": 1/4,
          "portion": "cup"
        },
        {
          "name": "Kalamata olives, chopped",
          "amount": 1/4,
          "portion": "cup"
        },
        {
          "name": "Feta cheese, crumbled",
          "amount": 1/3,
          "portion": "cup"
        },
        {
          "name": "Fresh parsley, chopped",
          "amount": 2,
          "portion": "tablespoons"
        },
        {
          "name": "Olive oil",
          "amount": 2,
          "portion": "tablespoons"
        },
        {
          "name": "Lemon juice",
          "amount": 1,
          "portion": "tablespoon"
        },
        {
          "name": "Garlic, minced",
          "amount": 1,
          "portion": "clove"
        },
        {
          "name": "Salt",
          "amount": 1/2,
          "portion": "teaspoon"
        },
        {
          "name": "Black pepper",
          "amount": 1/4,
          "portion": "teaspoon"
        }
      ],
      "instructions": [
        {
          "step": 1,
          "description": "Preheat the oven to 375°F (190°C)."
        },
        {
          "step": 2,
          "description": "Cut the tops off the bell peppers and remove the seeds and membranes."
        },
        {
          "step": 3,
          "description": "In a large bowl, mix together quinoa, cherry tomatoes, cucumber, red onion, olives, feta cheese, parsley, olive oil, lemon juice, garlic, salt, and black pepper."
        },
        {
          "step": 4,
          "description": "Stuff the bell peppers with the quinoa mixture and place them in a baking dish."
        },
        {
          "step": 5,
          "description": "Bake in the preheated oven for 25-30 minutes until the peppers are tender."
        },
        {
          "step": 6,
          "description": "Serve hot and enjoy the Mediterranean flavors!"
        }
      ],
      "equipment": [
        "Oven",
        "Baking dish",
        "Knife",
        "Cutting board",
        "Mixing bowl"
      ]
    }`;
    const cleaned = cleanJSON( text );
    console.log( cleaned );
    expect( () => JSON.parse( cleaned ) ).not.toThrow();
  } );
} );