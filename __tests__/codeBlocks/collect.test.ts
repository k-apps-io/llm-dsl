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
} );