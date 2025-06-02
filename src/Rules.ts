import { LLM } from "./definitions";
import { toCodeBlock } from "./utilities";

export const CODE_BLOCK_RULE: LLM.Stage.Rule<any, any, any, any, any> = {
  name: "Code Block Formatting",
  requirement: `All code blocks must adhere to the following format for consistency and clarity: ${ toCodeBlock( "{language}", "{content}" ) }`,
};