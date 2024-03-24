# @k-apps-io/llm-dsl
This is a DSL for interacting with a LLM. This paired with an implementation of `LLM` such as [@k-apps-io/llm-dsl-chatgpt](https://www.npmjs.com/package/@k-apps-io/llm-dsl-chatgpt) you can chain prompts together to formulate robust tasks. 

# Installation

```shell
npm install @k-apps-io/llm-dsl @k-apps-io/llm-dsl-chatgpt
```



# Usage

### Hello World
```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { CODE_BLOCK_RULE, DSL, Locals, json, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

type ChatLocals = Locals & {
  languages: string[];
};

const chat = new DSL<Options, ChatLocals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

chat
  .rule( CODE_BLOCK_RULE )
  .prompt( {
    message: "Hello!"
  } )
  .prompt( {
    message: 'send me 3 progamming languages as a JSON array e.g ```json ["lang1", "lang2", "langN"]```',
    response_format: { type: "json_object" }
  } )
  .expect( json(), ( { chat: $chat } ) => new Promise<void>( ( resolve, reject ) => {
    // using this locals I can pass data between prompts
    $chat.locals.languages = $chat.locals.$blocks as string[];
    resolve();
  } ) )
  .promptForEach( ( { locals } ) => {
    // using the locals I can generate many prompts
    return locals.languages.map( language => {
      const message = `write me a hello world progamming in ${ language }`;
      return { message: message };
    } );
  } )
  .stream( stdout() )
  .then( () => {
    console.log( "done" );
  } )
  .catch( error => {
    console.error( error );
  } );
```

# Rules
a `rule` represents a specific instruction for the LLM and `you` to follow. 

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

chat
  .rule( {
    name: "Bob Uecker",
    requirement: "respond in the style of Bob Uecker, the Famous Radio Broadcaster and not so Fammous American League Baseball Player"
  } )
  .prompt( {
    message: "Uecke, give me a home run call"
  } )
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
```

# Functions

In your DSL, you can define custom `functions` that the LLM may call, and the results will be returned as new `Message` object. This feature allows you to create custom logic and interactions within your conversation with the LLM.

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, localFileStorage, toCodeBlock, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

interface WeatherReport {
  temperature: number;
  unit: "Fahrenheit" | "Celsius";
  percipitation: string;
}
const chat = new DSL<Options, {}, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

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
    func: ( { unit = "Fahrenheit" } ) => {
      return new Promise( ( resolve, reject ) => {
        const weather: WeatherReport = {
          temperature: unit === "Fahrenheit" ? 24 : 5,
          unit: unit,
          percipitation: "it's snowing"
        };
        resolve( {
          message: toCodeBlock( "json", weather )
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
  .stream( stdout() )
  .then( ( $chat ) => {
    localFileStorage( { directory: __dirname, filename: "weatherReport", chat: $chat } );
    console.log( "done" );
  } )
  .catch( console.error );
```

# Prompting
a `prompt` is the main form of interacting with the LLM, use this command to send a message and generate a response

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

type ChatLocals = Locals & {
  hint: string;
};
const chat = new DSL<Options, ChatLocals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

chat
  .setLocals( {
    hint: "what is something the bank has that could be used on the football field?"
  } )
  .prompt( {
    message: "Why did the football team go to the bank?"
  } )
  .prompt( ( { locals, chat: $chat } ) => {
    // a prompt can also be defined as a StageFunction with access to
    // the locals and the chat
    return {
      message: `here is a hint: ${ locals.hint }`
    };
  } )
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
    
```


## response
`response` provides direct accesss the response of a prompt, it gives you control to review the response before continuing the pipeline.

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, toCodeBlock, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

type ChatLocals = Locals & {
  isChill: boolean;
  tasks: string[];
};
const chat = new DSL<Options, ChatLocals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

chat
  .prompt( {
    message: "finish the sentence 'one does not'"
  } )
  .response( ( { response, chat: $chat } ) => new Promise<void>( ( resolve, reject ) => {
    if ( response.content.includes( "Mordor" ) ) {
      $chat.locals = {
        isChill: true,
        tasks: []
      };
    } else {
      $chat.locals = {
        isChill: false,
        tasks: [ "shame for not wathcing LOTR", "grab some popcord", "force them to watch LOTR" ]
      };
    }
    resolve();
  } ) )
  .prompt( ( { locals, chat: $chat } ) => {
    if ( locals.isChill ) {
      return {
        message: "great answer"
      };
    } else {
      return {
        message: `nope, wrong... ${ toCodeBlock( "json", { todos: $chat.locals.tasks } ) }`
      };
    }
  } )
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
```

## expect
The `expect` function is another way to access the response of a prompt for validation. When working with the LLM, you can use this command to define specific criteria that the response should meet. If these criteria are not met, you have the option to call `reject("with your reason")` to initiate a [dispute resolution](#dispute-resolution) process. On the other hand, if the response aligns with your expectations, you can call `resolve()` to continue the pipeline.

This stage plays a pivotal role in ensuring that the Language Model's responses are in line with your desired outcomes. It serves as a valuable tool for quality control and enables the creation of custom interactions with the model. By setting clear expectations and handling responses accordingly, you can shape the behavior of the model to meet your specific needs.

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, json, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

interface Clubs extends Locals {
  clubs: {
    club: string;
    yardage: number;
  }[];
}
const chat = new DSL<Options, Clubs, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
chat
  .prompt( {
    message: "please generate a JSON Array of golf clubs I could hit out of the ruff. This JSON array must structured as ```typescript {\noptions: { club: string; yardage: number; }[]\n}``` and be provided as a JSON code block",
    response_format: { type: "json_object" }
  } )
  .expect( json(), ( { locals, chat: $chat } ) => new Promise<void>( ( resolve, reject ) => {
    locals.clubs = ( locals.$blocks as any ).options;
    /** todo validate that my current club is in my options */
    resolve();
  } ) )
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
```
#### json
`json` is a `ResponseStage` that will handle preparing any json code blocks as a usuable JSON value. As shown in the above example,you can pass this into your expect stage followed by your own `ResponseStage` validator.

#### Dispute Resolution

When you call `reject("with your reason")`, this message results in a new prompt to the LLM. The response of that prompt is then evaluated against your `expect` stage until it's resovled or the max
call stack is exceeded indicating a loop between the LLM and your `expect` stage.

> The maxCallStack is a setting you can control; the default is 10

## promptForEach
The `promptForEach` stage allows you to use an iterable e.g. a value in the chat `locals` to generate one or more prompts, each of which is executed sequentially. This function is particularly useful when you need to create multiple prompts dynamically based on the context data.


```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, json, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

interface Clubs extends Locals {
  clubs: {
    club: string;
    yardage: number;
  }[];
}
const chat = new DSL<Options, Clubs, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
chat
  .prompt( {
    message: "please generate a JSON Array of golf clubs I could hit out of the ruff. This JSON array must structured as ```typescript {\noptions: { club: string; yardage: number; }[]\n}``` ",
    response_format: { type: "json_object" }
  } )
  .expect( json(), ( { locals, chat: $chat } ) => new Promise<void>( ( resolve, reject ) => {
    locals.clubs = ( locals.$blocks as any ).options;
    /** todo validate the club in my hands is one of my options */
    resolve();
  } ) )
  .promptForEach( ( { locals } ) => {
    return locals.clubs.map( ( { club, yardage }, index ) => {
      return {
        message: `I expect the ruff to take about 40% off the distance of the club, what is the new yardarge for ${ club }?`
      };
    } );
  } )
  .prompt( {
    message: "I have 120y to the hole and I want to carry it 115y, which club should I use?"
  } )
  .prompt( {
    message: "would this be a full swing?"
  } )
  .prompt( {
    message: "I stuck it close, let's get some birds",
  } )
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
```

## branchForEach
`branchForEach` similary enables you to use the chat `locals` to generate a series of stages. The series is scoped to each stage between the `branchForEach` and the next `join` stage. Each series is executed sequentially.

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { writeFileSync } from "fs";
import { CODE_BLOCK_RULE, DSL, Locals, json, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

interface Cities extends Locals {
  cities: string[];
}
const chat = new DSL<Options, Cities, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
chat
  .rule( CODE_BLOCK_RULE )
  .prompt( {
    message: "generate a list of cities implementing the ```typescript interface { cities: string[] }``` as a json code block",
    response_format: { type: "json_object" }
  } )
  .expect( json(), ( { chat: $chat } ) => new Promise<void>( ( resolve, reject ) => {
    chat.locals = ( $chat.locals.$blocks as any ).cities;
    resolve();
  } ) )
  .branchForEach( ( { locals } ) => {
    return locals.cities.map( city => {
      return {
        message: `consider the following city, ${ city } and pick a monument, artificat or famous person in this city we'll call this the target`
      };
    } );
  } )
  .prompt( {
    message: "consider the RPG table top game Sprawl, create a new mission in this city that involves our target"
  } )
  .response( ( { response } ) => {
    // write the response to a file
    return new Promise<void>( ( resolve, reject ) => {
      writeFileSync( `./sprawl-missions/${ response.id }.txt`, response.content );
      resolve();
    } );
  } )
  .join()
  .stream( stdout() )
  .then( () => {
    console.log( "done" );
  } )
  .catch( error => {
    console.error( error );
  } );
```

# Locals

the chat `locals` is a shared space that enables the seamless exchange of information between different stages. It's a vital tool for tasks that involve gathering, adjusting, or retrieving data across multiple interactions. The chat `locals` ensures your conversation flows cohesively and empowers you to manage and transfer artifacts effortlessly.

To manage the chat `locals`, you can use commands like [response](#response) and [expect](#expect) or call `setLocals` directly

To use the `locals`, checkout [prompt](#prompting), [promptForEach](#promptforeach) and [branchForEach](#branchforeach)

# Window
The `window` is what we refer to as the `messages` you will include with a prompt for the LLM. This package comes with two implementations of `Window` as well as a means for you to implement your own.

## main
`main` is the default and provides a robust means to manage the `window`. It considers the `key`, `windowSize`, and the `Visibility` of the message. 

When the same `key` is set on multiple prompts only the latest in the `window` will be included; removing any prior messages with the same `key` from the prompt to the LLM.
```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

chat
  .prompt( {
    message: "Hello!"
  } )
  .prompt( {
    message: "tell me a joke",
    key: "2"
  } )
  // the prior prompt and response (joke) will not be included in this next call
  .prompt( {
    message: "tell me a joke",
    key: "2"
  } )
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
```

Using the `windowSize` setting, you can control the max amount of tokens allowed for the `window`. This gives you further control to keep the `window` smaller, reducing cost or larger if needed.

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
  settings: {
    // this will be the max size of the window for each prompt
    //  keeping it small can help reduce costs
    windowSize: 200 
  }
} );
```

Finallly, set the `visibility` on prompts to control whether a message should always be included, excluded or optionally included. `Visibility.REQUIRED` will ensure that these messages will always be in the window. Then relative to the `windowSize` this implementation will fill the remaining with messages that have `visiblity` of `Visibility.OPTIONAL` or `Visibility.SYSTEM`. The final option is `Visibility.EXCLUDE` which will never be included in the `window`.

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, Visibility, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

chat
  .prompt( {
    message: "Hello!",
    visibility: Visibility.REQUIRED
  } )
  // the following prompt will be sent to the LLM
  .prompt( {
    message: "tell me a joke",
    visibility: Visibility.EXCLUDE
  } )
  // the prior prompt and response (joke) will not be included in this next call
  // b/c it's visibility is EXCLUDED which is now evaluated in the chat window
  .prompt( {
    message: "tell me a joke"
  } )
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
```

## latest
`latest` is a simple implementation of `Window` which only include at most `n` messages with your prompt to the LLM.
```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, latest, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
  window: latest( { n: 2 } )
} );

chat
  .prompt( {
    message: "Hello!"
  } )
  /**
   * do your thing
   */
  .stream( stdout() )
  .then( () => console.log( "done" ) )
  .catch( console.error );
```

## custom
Of course, there may be a need for you to have more control over your `window`. This can be done by creating a function that implements `Window` and assign it to your `DSL` instance.
```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { Chat, DSL, Locals, Metadata, Window } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

type MyMetadata = Metadata & {
  /**
   * define your custom metadata to store about the chat
   */
};

const myWindow: Window = ( { messages, tokenLimit, key } ) => {
  return messages.reduce( ( prev, curr ) => {
    prev.push( curr );
    return prev;
  }, [] as Chat<MyMetadata>[ "messages" ] );
};

const chat = new DSL<Options, Locals, MyMetadata>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
  window: myWindow
} );
```

# Storage
chats can be stored for later use; this requires a `storage` mechanism of your choosing. This package provides
`localFileStorage` which will write the chat to a `json` file once it completes as well as `localFileStream` which will stream the chat realtime to a text file.

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, localFileStorage, localFileStream, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
chat.prompt( {
  message: "hello world"
} )
  // you can provide many stream handlers such as stdout and localFileStream
  .stream( stdout(), localFileStream( { directory: __dirname, filename: "hello world" } ) )
  // similarly, you can write the chat once it's completed
  .then( $chat => localFileStorage( { directory: __dirname, chat: $chat, filename: "hello world" } ) )
  .catch( error => {
    console.error( error );
  } );
```

## resuming / cloning
an existing chat data can be continued / resumed with `load` or reused with `clone`

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { Chat, DSL, Locals, localFileStorage } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

chat
  // clone a chat which allows the pipeline to be repeatedly executed without conflict between executions (memory and pointer yada yada)
  .clone()
  // load in an existing chat
  .load( ( id ) => new Promise<Chat<any>>( ( resolve, reject ) => {
    /**
     * call a storage service like a MongoDB or OracleDB to recall an existing chat
     */
  } ) )
  /**
   * consider my shot into the green from earlier; continuing afer my birdy put
   */
  .prompt( {
    message: "Moving onto the next whole, it's a short Par 4 with trouble near the green. I'm debating laying up to the largest part of the fairway. I believe i'll have about 165y in if i do. Or i could go for it with a higher risk chip."
  } )
  .stream( chunk => {
    /**
     * call a storage service to store the chunks as they're produced
     */
  } )
  .then( $chat => {
    /**
     * or call the storage service here with the full chat
     */
    localFileStorage($chat);
  } )
  .catch( error => {
    console.error( error );
  } );

```

# pipeline
you can access and manage the pipeline execution with `exit` and `moveTo`.

## exit
If for some reason you need the pipeline to stop executing call `chat.exit()`. This optionally accepts a `Error` as an argument which will be thrown after the current stage resolves.
```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
chat
  .clone()
  .prompt( {
    message: "hello!"
  }, "1" )
  .response( ( { chat } ) => {
    return new Promise<void>( ( resolve, reject ) => {
      chat.exit(); // clean exit
      resolve();
    } );
  } )
  // this prompt won't get called
  .prompt( {
    message: "goodbye."
  }, "3" )
  .response( ( { chat } ) => {
    return new Promise<void>( ( resolve, reject ) => {
      chat.exit(new Error("what went wrong"));
      resolve();
    } );
  } )
  .stream( stdout() )
  .then( () => {
    console.log( "done" );
  } )
  .catch( error => {
    console.error( error );
  } );
```

## moveTo
`chat.moveTo` is a means to move / skip stages within the pipeline. To use this function the target stage's id must be known. It's recommened to set the stage id statically or with a deterministic value.

> stage id's default to v4 uuids

```typescript
import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals, stdout } from "@k-apps-io/llm-dsl";

require( "dotenv" ).config();

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
chat
  .prompt( {
    message: "hello!"
  }, "1" )
  .response( ( { chat } ) => {
    return new Promise<void>( ( resolve, reject ) => {
      chat.moveTo( { id: "4" } );
      resolve();
    } );
  } )
  .prompt( {
    message: "love ya"
  }, "3" )
  .prompt( {
    message: "goodbye."
  }, "4" )
  .stream( stdout() )
  .catch( error => {
    console.error( error );
  } );
```