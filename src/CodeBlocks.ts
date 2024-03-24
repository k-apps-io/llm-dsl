import { Grammars, IToken } from "ebnf";
import { CodeBlock } from "./Chat";

const grammar = `
message     ::= TEXT* WS* ( block ) WS* TEXT* WS* message*  /* Represents a message with zero or more blocks */
block       ::= "\`\`\`" lang WS* code WS* "\`\`\`"         /* Represents a code block with language specification */
lang        ::= [\\w]+                                      /* Matches a sequence of word characters for language */
code        ::= TEXT*                                       /* Represents the content of a code block */
WS          ::= [#x20#x09#x0A#x0D]+                         /* Space | Tab | \\n | \\r - Matches one or more whitespace characters */
TEXT        ::= [^\`] | "\`" [^\`]                          /* Any character except a backtick or a backtick not followed by another backtick */
`;

const parser = new Grammars.W3C.Parser( grammar );

const collect = ( token: IToken ): CodeBlock[] => {
  return token.children.flatMap( child => {
    if ( child.type === "message" ) return collect( child );
    return child.children.reduce( ( prev, curr ) => {
      prev[ curr.type ] = curr.text.trim();
      return prev;
    }, {} as CodeBlock & { [ key: string ]: any; } );
  } );
};

export const extract = ( text: string ): CodeBlock[] => {
  const token = parser.getAST( text );
  if ( token === null ) return [];
  const blocks = collect( token );
  return blocks;
};

export const toCodeBlock = ( lang: string, value: any ) => {
  if ( lang.toLowerCase() === "json" && typeof value === "object" ) value = JSON.stringify( value, null, 2 );
  return `\`\`\`${ lang }\n${ value }\`\`\`\n`;
};