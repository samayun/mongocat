export const unflattenObj = (data: Record<string, any>) => {
  const result: Record<string, any> = {};

  for (const i in data) {
    const keys = i.split('.');
    keys.reduce(function(r, e, j) {
      return (
        r[e] ||
        (r[e] = isNaN(Number(keys[j + 1]))
          ? keys.length - 1 == j
            ? data[i]
            : {}
          : [])
      );
    }, result);
  }
  return result;
};
