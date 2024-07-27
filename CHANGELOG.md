# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1] - 2024-07-27
### Added
- Implemented a new function `call` - allows you to programatically trigger a function provided by to the LLM.
- New Argument to `clone` - when cloning you can specify whether the cloned DSL should start at the `beginning`, `end` or a specific position of the pipeline.
- A message is now added to the chat indicating the LLM called a function with including the args. This message will have the role `system`.

### Changed
- Moved the functionality of `push` to `append`.
- Changed the functionality of `push` - now adds a message after the current pipeline position without generating a prompt. Prior to this change, the message would be appended to the pipeline (functionality still exists with `append`).
- Changed the content format for function responses removing the text `call ${ name }() ->`.

### Fixes
- Hallucination of how to call a function available to the LLM.

##  [2.0.2] - 2024-04-02
### Added
- New attribute: `Message.functions` - an optional object listing key value pairs of the function name and the number of input tokens. An additional key `Message.functions.total` will be included indicating the total tokens used by functions.
- New Argument to `#prompt`: `functions` - a falsy value indicating whether functions should be excluded on an individual prompt.
- The instance of LLM now includes abstract functions for `windowTokens`, `functionTokens` and `close`. Both the `windowTokens` and `functionTokens` were extracted from the DSL and provied to the LLM as each may calculate these differently.
- New Feature to `Window` - this now accepts an addition argument `chat` which gives the `window` function the ability to access additional data specifically the LLMs `windowTokens` function. 

### Fixed
- summarizing `Chat.inputs` and `Chat.outputs`. All messages with role `assistant` are summarized in `Chat.outputs` all other messages will be `Chat.inputs`.


## [2.0.1] - 2024-03-26

### Added
- `stream` now supports multiple `StreamHandlers` as `rest` arguments.
- `expect` now supports multiple `ResonseStages` as `rest` arguments.
- New type `Window` which enables a custom windowing function.
- New `pipeline` management features: `moveTo`, `exit`, `pause`.

### Changed
below describes the changes made to the `Chat` interface
- Visibility Enum: `Visibility.OPTIONAL` = `0`; `Visibility.SYSTEM` = `1`; Prior to this release, the values were swapped.
- `Message.included` was renamed to `Message.window`
- `Message.tokens` was renamed to `Message.size`
- `Chat.metadata` is now typed.whether a token was part of the input promopt or the output response. Models charge differently for each.
- New attribute: `Message.prompt` which will identify what prompt or other stage generated the message.
- New attribute: `Message.windowSize`
- New attribute: `Chat.inputs` and `Chat.outputs` which summarize the tokens within the chat and diffirentiate 
