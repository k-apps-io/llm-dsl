# @k-apps.io/llm-dsl
this is a DSL for interacting with a LLM, chaining commands together to formulate robust tasks

# Installation

```shell
npm install @k-apps.io/llm-dsl
```

pair this with an LLM implementation such as

[@k-apps.io/llm-dsl-chatgpt](https://www.npmjs.com/package/@k-apps.io/llm-dsl-chatgpt)

# Usage

### Hello World
```javascript
import { LLM, DSL, LocalStorage, Rules, CODE_BLOCK_RULE } from "@k-apps.io/llm-dsl";
import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";

require( "dotenv" ).config();

const main = () => {

  const LLM = new ChatGPT({});

  type Context = string[];

  const chat = new DSL<Options, Context>( {
    llm: LLM,
    storage: LocalStorage,
    options: {
      model: "gpt-4"
    }
  } );

  chat
    .rule( CODE_BLOCK_RULE )
    .prompt( {
      message: "Hello!"
    } )
    .prompt( {
      message: 'send me 3 progamming languages as a JSON object e.g ```json ["lang1", "lang2", "langN"]```',
    } )
    .expect( ( response ) => new Promise<void>( ( resolve, reject ) => {
      // setting expectations for the response
      if ( response.codeBlocks === undefined ) {
        reject( "expecting a json code block" );
      } else if ( response.codeBlocks.length > 1 ) {
        reject( "only 1 code block was requested" );
      } else {
        const block = response.codeBlocks[ 0 ];
        if ( block.lang !== "json" ) {
          reject( `expecting a json code block, found '${ block.lang }' instead` );
        } else {
          const data = JSON.parse( block.code );
          // setting the context in this command makes it available hereafter
          chat.context = data;
          resolve();
        }
      }
    } ) )
    .promptForEach( ( languages: Context ) => {
      // using this context I can send more prompts
      return languages.map( language => {
        const message = `write me a hello world progamming in ${ language }`;
        return { message: message };
      } );
    } )
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then( () => {
      console.log( "done" );
    } )
    .catch( error => {
      console.error( error );
    } );
}
```

# Rules
a `rule` represents a specific instruction for the LLM and `you` to follow. Regardless where you define these in the chain of commands they will always be included at the top of the convesation with `Visibility.REQUIRED`

```javascript
import { DSL, Rule } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL({});
  chat
    .rule({
      name: "Bob Uecker",
      requirement: "respond in the style of Bob Uecker, the Famous Radio Broadcaster and not so Fammous American League Baseball Player"
    })
    .prompt({
      message: "Uecke, give me a home run call"
    })
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content );
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```

# Functions

In your DSL script, you can define custom `functions` that the Language Model (LLM) may call, and the results will be returned as new `Message` objects. This feature allows you to create custom logic and interactions within your conversation with the LLM.

```javascript
import { DSL, Rule, Options } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL({});
  chat
    .function<{ unit?: "Fahrenheit" | "Celsius"; }>( {
      name: "getTheCurrentWeather",
      description: "helps the AI model determine the current weather",
      parameters: {
        "type": "object",
        "properties": {
          "unit": {
            "type": "string",
            "enum": [ "Fahrenheit", "Celsius" ]
          }
        }
      },
      func: ( { unit = "Fahrenheit", context } ) => {
        return new Promise( ( resolve, reject ) => {
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
      message: "what's the weather like today?"
    } )
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content );
    } )
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```

# Prompting
a `prompt` is the main form of interacting with the LLM, use this command to send a message and generate a response

```javascript
import { DSL, Options } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL<Options, string>({});
  chat.context = "what is something the bank has that could be used on the football field?";
  chat
    .prompt({
      message: "Why did the football team go to the bank?"
    })
    .prompt( context => {
      // a prompt can also access the context of the chat via a `CommandFunction`
      return {
        message: `here is a hint: ${context}`
      }
    })
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```

# Context

the `context` is a shared space that enables the seamless exchange of information between different commands and prompts. It's a vital tool for tasks that involve gathering, adjusting, or retrieving data across multiple interactions. The `context` ensures your conversation flows cohesively and empowers you to manage and transfer artifacts effortlessly.

To manage the `context`, you can use commands like [response](#response) and [expect](#expect) or call `setContext` directly

To use the `context`, checkout [prompt](#prompting), [promptForEach](#promptforeach) and [branchForEach](#branchforeach)


## response
`response` provides direct accesss the response of a prompt, it gives you control to continue the chain of commands by calling `resolve` or stop by calling `reject`

```javascript
import { DSL, Options } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL<Options, string>({});
  chat
    .prompt({
      message: "finish the sentence 'one does not'"
    })
    .response( response => new Promise<void>(( resolve, reject ) => {
      if ( response.content.includes("Mordor")) {
        chat.context = {
          isChill: true,
        }
      } else {
        chat.context = {
          isChill: false,
          tasks: [ "watch LOTR" ]
        }
      }
      resolve();
    }))
    .prompt( ( context, $this ) => {
      if ( context.isChill ) {
        return {
          message: "great answer"
        }
      } else {
        return {
          message: "I need you to watch LOTR"
        }
      }
    })
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```

## expect
The `expect` function is another way to access the response of a prompt and set expectations for it. When working with the Language Model (LLM), you can use this command to define specific criteria that the response should meet. If these criteria are not met, you have the option to call `reject("with your reason")` to initiate a [dispute resolution](#dispute-resolution) process. On the other hand, if the response aligns with your expectations, you can use the `resolve()` method to continue the chain of interactions.

This command plays a pivotal role in ensuring that the Language Model's responses are in line with your desired outcomes. It serves as a valuable tool for quality control and enables the creation of custom interactions with the model. By setting clear expectations and handling responses accordingly, you can shape the behavior of the model to meet your specific needs.

```javascript
import { DSL, Options } from "@k-apps.io/llm-dsl";

interface Club {
  club: string;
  yardage: number;
}

const main = () => {
  const chat = new DSL<Options, Club[]>({});
  chat
    .prompt({
      message: "please generate a JSON Array of golf clubs I could hit out of the ruff. This JSON array must structured as ```javascript {\noptions: { club: string; yardage: number; }[]\n}``` and be provided as a JSON code block"
    })
    .expect( response => new Promise<void>(( resolve, reject ) => {
      // I have high expecations
      if ( response.codeBlocks === undefined ) {
        reject("a json code block was expected")
      } else if ( response.codeBlocks.length > 1 ) {
        reject("too many code blocks, only 1 is required")
      } else {
        const block = response.codeBlocks[0];
        if ( block.lang !== "json" ) {
          reject("code block must be 'json'")
        } else {
          const data = JSON.parse(block.code);
          chat.context = data.options;
          resolve();
        }
      }
    }))
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```
#### Dispute Resolution

When you call `reject("with your reason")`, the DSL will initiate a `sidebar` chat to resolve the dispute between your expectations and the prior response. This `sidebar` chat retains the `conetxt`, `rules` and `functions` you originally defined in the main chat.

Each response generated in the `sidebar` will be assessed against your expectations until they are met or the maximum call stack limit is reached. 

> Adjust the expect max call stack with `setMaxCallStack`

The response that aligns with your expectations will be marked with `Visibility.OPTIONAL` and will follow the response that triggered the dispute. The initial response that led to the dispute will be updated with a visibility of `Visibility.HIDDEN`, and the chain of commands will resume.

## promptForEach
The `promptForEach` command allows you to use the chat `context` to generate one or more prompts, each of which is executed sequentially and synchronously. This function is particularly useful when you need to create multiple prompts dynamically based on the context data.


```javascript
import { DSL } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL({});
  chat
    /** continued from above */
    .promptForEach( ( context: Club[] ) => {
      return context.map(({ club, yardage}, index ) => {
        return {
          message: `I expect the ruff to take about 40% off the distance of the club, what is the new yardarge for ${club}?`
        }
      })
    })
    .prompt({
      message: "I have 120y to the hole and I want to carry it 115y, which club should I use?"
    })
    .prompt({
      message: "would this be a full swing?"
    })
    .prompt({
      message: "I stuck it close, let's get some birds",
    })
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```

## branchForEach
`branchForEach` similary enables you to use the chat `context` to generate a series of commands. The series is scoped to each command between the `branchForEach` and the next `join` command. Each series is executed sequentially and synchronously.

```javascript
import { DSL } from "@k-apps.io/llm-dsl";

const main = () => {
  const LLM = new ChatGPT( {} );

  const chat = new DSL<PromptOptions, Context>( {
    llm: LLM,
    storage: LocalStorage,
    options: {
      model: "gpt-4",
      temperature: 0.5,
      top_p: 0.5
    }
  } );

  chat
    .rule( CODE_BLOCK_RULE )
    .prompt( {
      message: "generate a list of cities implementing the ```typescript interface { cities: string[] }``` as a json code block"
    } )
    .expect( response => {
      // todo - set the expectations
      const data = JSON.parse( response.codeBlocks![0].code );
      chat.context = data.cities;
      resolve();
    })
    .branchForEach( context => {
      return context.map( city => {
        return {
          message: `consider the following city, ${ city } and pick a monument, artificat or famous person in this city we'll call this the target`
        };
      } );
    } )
    .prompt( {
      message: "consider the RPG table top game Sprawl, create a new mission in this city that involves our target"
    } )
    .response( response => {
      // write the response to a file
      return new Promise<void>(( resolve, reject ) => {
        writeFileSync(`./sprawl-missions/${response.id}.txt`);
        resolve();
      })
    })
    .join()
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then( () => {
      console.log( "done" );
    } )
    .catch( error => {
      console.error( error );
    } );
};

main();

```

# Storage
chats can be stored for later use; this requires a `storage` mechanism. This mechanism manages saving and retrieving chats from a data store. This package includes `LocalStorage` which will save the chats to the local file system and `NoStorage` which does not save any chats. 

`LocalStorage` requires an environment variable `CHATS_DIR` where the chats will be stored as `{id}.json` files 
> CHATS_DIR will not be created automatically
```text
# .env
CHATS_DIR=/opt/chats
```


## Custom
you can define your own storage mechanism by implementing the `Storage` interface

```javascript
import { ChatStorage } from "@k-apps.io/llm-dsl";

const MyAPI: ChatStorage = {
  getById: ( id: string ): Promise<Chat> => {
    return new Promise<Chat>( ( resolve, reject ) => {
      /**
       * TODO: retrieve an existing chat
       */
      reject();
    } );
  },
  save: ( chat: Chat ): Promise<void> => {
    return new Promise<void>( ( resolve, reject ) => {
      /**
       * TODO: save the chat
       */
      reject();
    } );
  }
}

const main = () => {
  const chat = new DSL({
    storage: MyAPI,
    // ...
  });
}

main();
```
