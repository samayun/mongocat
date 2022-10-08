export class ObjectBuilder {
  static filterObject(
    obj: Record<string, any>,
    condition: (v: any, key: string) => boolean,
    objCondition: (v: any) => any = Object
  ): Record<string, any> {
    return Object.entries(obj)
      .filter(([key, value]) => condition(value, key))
      .reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: Array.isArray(value)
            ? value
            : value === objCondition(value)
            ? this.filterObject(value, condition)
            : value,
        }),
        {}
      );
  }
}
