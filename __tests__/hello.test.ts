function sayHello() {
  return "Hello, World!";
}

test( "sayHello should return 'Hello, World!'", () => {
  expect( sayHello() ).toBe( "Hello, World!" );
} );