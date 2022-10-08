export class ArrayBuilder {
  // Suport on evry version
  static uniq = (array: any[], field: string) => {
    return array.reduce((accumulator, current) => {
      if (!accumulator.includes(current[field])) {
        accumulator.push(current[field]);
      }
      return accumulator;
    }, []);
  };
  // Suport on ES6 or higher version only
  static uniqueKeys = (array: any[], field: string) => {
    return [...new Set(array.map(p => p[field]?.toString()))];
  };

  static uniqueValues = (array: any[], field: string) => {
    return array.filter(
      (item, index, self) =>
        self.findIndex(
          v => v[field]?.toString() === item[field]?.toString()
        ) === index
    );
  };

  static uniqueCombined(array: any[], array2: any[], field: string) {
    return array.map(script =>
      array2.filter(inp => inp[field] !== script[field])
    );
  }
}
