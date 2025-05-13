import { extract, toCodeBlock } from "../../src/CodeBlocks";


describe( "json", () => {

  it( 'should find 1 code block', async () => {
    const content = `${ toCodeBlock( "json", { "key": 1 } ) }`;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
  } );

  it( 'should find 1 code block within mixed text', async () => {
    const content = `
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed id justo euismod, cursus nulla eget, tristique tellus. Vivamus JSON Example eleifend eu ex eget tempus. Integer quis dolor eget urna ultricies placerat. Donec sit amet vehicula metus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Suspendisse potenti.
    ${ toCodeBlock( "json", { "key": 1 } ) }
    Phasellus in tempus diam, non vestibulum quam. Sed feugiat justo at mi porta, ut lobortis lorem aliquam. Cras sodales, elit sit amet volutpat tincidunt, est risus commodo libero, at scelerisque enim nulla id lectus. Vivamus non augue id eros rutrum gravida. Maecenas nec arcu in nisi feugiat semper. Sed id libero id est sollicitudin finibus.

    This JSON block represents an example object with name, age, and city fields.
    `;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
  } );

  it( 'should find 2 code block within mixed text', async () => {
    const content = `
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed id justo euismod, cursus nulla eget, tristique tellus. Vivamus JSON Example eleifend eu ex eget tempus. Integer quis dolor eget urna ultricies placerat. Donec sit amet vehicula metus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Suspendisse potenti.
    ${ toCodeBlock( "json", { "key": 1 } ) }
    Phasellus in tempus diam, non vestibulum quam. Sed feugiat justo at mi porta, ut lobortis lorem aliquam. Cras sodales, elit sit amet volutpat tincidunt, est risus commodo libero, at scelerisque enim nulla id lectus. Vivamus non augue id eros rutrum gravida. Maecenas nec arcu in nisi feugiat semper. Sed id libero id est sollicitudin finibus.
    ${ toCodeBlock( "html", `<body></body>` ) }
    This JSON block represents an example object with name, age, and city fields.
    `;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 2 );
    const block1 = blocks[ 0 ];
    expect( block1 ).toBeDefined();
    expect( block1.lang ).toBe( "json" );
    const block2 = blocks[ 1 ];
    expect( block2 ).toBeDefined();
    expect( block2.lang ).toBe( "html" );
  } );

  it( 'should find 1 code block separatros', async () => {
    const content = `
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed id justo euismod, cursus nulla eget, tristique tellus. Vivamus JSON Example eleifend eu ex eget tempus. Integer quis dolor eget urna ultricies placerat. Donec sit amet vehicula metus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Suspendisse potenti.
    ${ toCodeBlock( "json:foo", { "key": 1 } ) }
    This JSON block represents an example object with name, age, and city fields.
    `;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    const block1 = blocks[ 0 ];
    expect( block1 ).toBeDefined();
    expect( block1.lang ).toBe( "json:foo" );
  } );
} );

describe( "expanded lang formats", () => {

  it( 'should find a code block with lang containing hyphen', async () => {
    const content = `${ toCodeBlock( "json-foo", { "key": 1 } ) }`;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    expect( blocks[ 0 ].lang ).toBe( "json-foo" );
  } );

  it( 'should find a code block with lang containing colon', async () => {
    const content = `${ toCodeBlock( "json:bar", { "key": 1 } ) }`;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    expect( blocks[ 0 ].lang ).toBe( "json:bar" );
  } );

  it( 'should find a code block with lang containing underscore', async () => {
    const content = `${ toCodeBlock( "yaml_config", { "key": 1 } ) }`;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    expect( blocks[ 0 ].lang ).toBe( "yaml_config" );
  } );

  it( 'should find a code block with lang containing period', async () => {
    const content = `${ toCodeBlock( "python3.9", { "key": 1 } ) }`;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    expect( blocks[ 0 ].lang ).toBe( "python3.9" );
  } );

  it( 'should find multiple code blocks with mixed lang formats', async () => {
    const content = `
    ${ toCodeBlock( "json-foo", { "key": 1 } ) }
    ${ toCodeBlock( "yaml_config", { "key": 2 } ) }
    ${ toCodeBlock( "python3.9", { "key": 3 } ) }
    `;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 3 );
    expect( blocks[ 0 ].lang ).toBe( "json-foo" );
    expect( blocks[ 1 ].lang ).toBe( "yaml_config" );
    expect( blocks[ 2 ].lang ).toBe( "python3.9" );
  } );

  it( 'should not find a code block with invalid lang format', async () => {
    const content = `
    \`\`\`valid@lang
    { "key": 1 }
    \`\`\`
    `;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    expect( blocks[ 0 ].lang ).toBe( "valid@lang" );
    expect( blocks[ 0 ].code ).toBe( '{ "key": 1 }' );
  } );

  it( 'should handle empty code block gracefully', async () => {
    const content = `
    ${ toCodeBlock( "json-foo", JSON.stringify( {} ) ) }
    `;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    expect( blocks[ 0 ].lang ).toBe( "json-foo" );
    expect( blocks[ 0 ].code ).toBe( "{}" );
  } );

  it( 't1', async () => {
    const content = `## Attribute - \`reservation\` 

>artifact: 67efc35ac7fcd79268cc61f2 

### value schema

\`\`\`json
{
  "type": "string",
  "enum": [
    [
      "required",
      "recommended",
      "optional",
      "none",
      "unknown"
    ]
  ]
}
\`\`\``;
    const blocks = extract( content );
    expect( blocks.length ).toBe( 1 );
    expect( blocks[ 0 ].lang ).toBe( "json" );
  } );

} );