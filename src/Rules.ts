export interface Rule {
  id?: string;
  name: string;
  requirement: string;
  key?: string;
}

export const CODE_BLOCK_RULE: Rule = {
  name: "Code Block Formatting",
  requirement: "All code blocks must adhere to the following format for consistency and clarity: ```{lang}\n{content}```"
};