# @k-apps.io/llm-dsl
this is a DSL for interacting with a LLM, chaining commands together to formulate robust tasks

# Installation
```shell
npm install @k-apps.io/llm-dsl
```
# Usage

### Hello World
```javascript
import { LLM, DSL, LocalStorage, Rules, CODE_BLOCK_RULE } from "@k-apps.io/llm-dsl";
import ChatGPT, { Options } from "@k-apps.io/llm-dsl-chatgpt";

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
    .stream( ( { content, chatId, messageId } ) => {
      process.stdout.write( content );
    } )
    .then( () => {
      console.log( "done" );
    } )
    .catch( error => {
      console.error( error );
    } );
}
```

## Supported LLMs
any LLM can be supported, wrap the one you want in the abstact `LLM` class to get started

below are supported implemetnations of popular LLMs

[@k-apps.io/llm-dsl-chatgpt](https://www.npmjs.com/package/@k-apps.io/llm-dsl-chatgpt)


# Rules
a `rule` represents a specific instruction for the LLM and `you` to follow. Regardless where you define these in the chain of commands they will always be included 
at the top of the convesation with `Visibility.REQUIRED`

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
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```

# Functions
a `function` can be defined in the chain of commands. The LLM may then call this function with the result provided back as a new `Message`

```javascript
import { DSL, Rule, Options } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL({});
  chat
    .function({
      name: "getTheCurrentWeather",
      parameters: { type: "object", args: {}},
      description: "helps the AI model determine the current weather",
      func: ( ) => {
        return new Promise<Options>(( resolve, reject) => {
          // TODO - go outside
          resolve({
            message: "it's snowing!"
          })
        })
      }
    })
    .prompt({
      message: "what's the weather like today?"
    })
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

```

# Prompting
a `prompt` is the main form of interacting with the LLM, use this command to send a message and generate a response

```javascript
import { DSL } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL({});
  chat
    .prompt({
      message: "give me a TL;DR on javascript"
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
each instance of the DSL has a `context` attribute to pass data between each command. To set the context you can use the commands `response` or `expect`.

`response` provides direct accesss the response of a prompt, it gives you control to continue the chain of commands or stop by calling `reject`

```javascript
import { DSL, Options } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL<Options, string>({});
  chat
    .rule({
      name: "Wrong Answers Only",
      requirement: "set the sarcasm level to the max and provide wrong answers only"
    })
    .prompt({
      message: "finish the sentence 'one does not'"
    })
    .response( response => new Promise<void>(( resolve, reject ) => {
      // do what you need
      chat.context = "";
      resolve();
    }))
    .stream( chunk => {
      if ( chunk.type === "message" ) process.stdout.write( chunk.content )
    })
    .then(() => console.log("done"))
    .catch(console.error)
}

main();
```

`expect` is another way to access the response of a prompt. In this command you can set expecations and when those are not met, `reject("with a reason")` otherwise `resolve()` to continue the chain.

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

when `reject("with a reason")` is called, the DSL will start a `sidebar` chat to resolve the disput between your expecatations and the response. This `sidebar` chat maintains the `rules` and `functions` you have defined in the original chat. The result of the `sidebar` conversation will be
evaluated against your expecations again. If another `reject("with a reason")` is called it will be propagated to `.catch()` and the chain of commands will stop.

## Context Commands
using the command `promptForEach`, the chat `context` can be used to generate 1 or more `prompts` where each is executed individually.


```javascript
import { DSL } from "@k-apps.io/llm-dsl";

const main = () => {
  const chat = new DSL({});
  chat
    /** ... continued from above */
    .promptForEach( ( context: Club[]) => {
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

`branchForEach` similary enables you to use the chat `context` to generate a series of commands. The series is determined by the next `join` command. Each command between the `branchForEach` and `join` will be executed for each branch created.

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
      return new Promise<void>( ( resolve, reject ) => {
        if ( response.codeBlocks === undefined ) {
          reject( "a code block was requested" );
        } else if ( response.codeBlocks.length > 1 ) {
          reject( "only send 1 code block" );
        } else {
          const block = response.codeBlocks[ 0 ];
          if ( block.lang !== "json" ) {
            reject( "a json code block was expected" );
          } else {
            const data = JSON.parse( block.code );
            chat.context = data.cities;
            resolve();
          }
        }
      } );
    } )
    .branchForEach( context => {
      return context.map( city => {
        return {
          message: `consider the following city, ${ city } which country is this located in?`
        };
      } );
    } )
    .prompt( {
      message: "consider the RPG table top game Sprawl, create a new mission in this city as plaintext"
    } )
    .response( response => {
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
the DSL requires a `storage` mechanism which manages saving and retrieving chats from a data store. This package includes `LocalStorage` which will save the chats to the local file system. 

`LocalStorage` requires an environment variable `CHATS_DIR` where the chats will be stored as `{id}.json` files 
> CHATS_DIR will not be created automatically
```text
# .env
CHATS_DIR=/opt/chats
```

## Custom Storage Mechanism
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
  const storage = MyAPI();
  const chat = new DSL({
    storage: storage,
    // ...
  });
}

main();
```
