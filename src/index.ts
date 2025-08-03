import { isRegExp } from 'util/types';

export default class Generator {

  private static indentLevel = 0;
  private static readonly INDENT = '    ';

  private static readonly SCHEMA_DIR = process.env.SCHEMA_DIR

  private static readonly collectionSchemas: Map<string, Record<string, any>> = new Map()

  /**
   * Main method to convert JSON to TypeScript declaration
   */
  static generateDeclaration(json: any, interfaceName: string = '_template'): string {
    if (typeof json !== 'object' || json === null) {
      throw new Error('Input must be a valid JSON object');
    }

    const interfaceBody = Generator.generateInterfaceBody(json);
    return `interface _${interfaceName} {\n${interfaceBody}}\n`;
  }

  /**
   * Generate the body of the TypeScript interface
   */
  private static generateInterfaceBody(obj: any): string {
    const properties: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const type = this.inferType(value);
      const propertyKey = Generator.sanitizePropertyName(key);
      
      properties.push(`${this.INDENT}${propertyKey}: ${key.endsWith('?') ? `${type} | null` : `${type}`}`);
    }
    
    return properties.join('\n') + '\n';
  }

  /**
   * Infer TypeScript type from JSON value
   */
  private static inferType(value: any): string {
    if (value === null) {
      throw new Error(`value cannot be null, please use '?' for nullable properties`)
    }

    if (Array.isArray(value)) {
      return this.inferArrayType(value);
    }

    if (typeof value === 'object') {
      return this.inferObjectType(value);
    }

    return typeof value
  }

  /**
   * Infer type for arrays
   */
  private static inferArrayType(arr: any[]): string {
    if (arr.length === 0) {
      return 'Array<unknown>';
    }

    // Get types of all elements
    const elementTypes = arr.map(item => this.inferType(item));
    const uniqueTypes = [...new Set(elementTypes)];

    if (uniqueTypes.length === 1) {
      // All elements have the same type
      return `Array<${uniqueTypes[0]}>`;
    } else {
      // Mixed types - create union
      return `Array<${uniqueTypes.join(' | ')}>`;
    }
  }

  /**
   * Infer type for nested objects
   */
  private static inferObjectType(obj: any): string {
    if (Object.keys(obj).length === 0) {
      return 'Record<string, unknown>';
    }

    // Check if it's a simple key-value record pattern
    if (this.isSimpleRecord(obj)) {
      const valueTypes = Object.values(obj).map(v => this.inferType(v));
      const uniqueValueTypes = [...new Set(valueTypes)];
      
      if (uniqueValueTypes.length === 1) {
        return `Record<string, ${uniqueValueTypes[0]}>`;
      } else {
        return `Record<string, ${uniqueValueTypes.join(' | ')}>`;
      }
    }

    // Generate inline interface for complex objects
    this.indentLevel++;
    const properties: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const type = this.inferType(value);
      const propertyKey = Generator.sanitizePropertyName(key);
      const indent = this.INDENT.repeat(this.indentLevel);
      
      properties.push(`${indent}${propertyKey}: ${key.endsWith('?') ? `${type} | null` : `${type}`}`);
    }
    
    this.indentLevel--;
    const indent = this.INDENT.repeat(this.indentLevel);
    
    return `{\n${properties.join('\n')}\n${indent}}`;
  }

  /**
   * Check if an object represents a simple key-value record
   */
  private static isSimpleRecord(obj: any): boolean {
    const keys = Object.keys(obj);
    
    // Heuristic: if all keys are similar (e.g., all empty strings, all single chars)
    // or if there are many keys with simple values, treat as Record
    if (keys.length > 5) return true;
    
    const hasEmptyStringKey = keys.includes('');
    const allSimpleValues = Object.values(obj).every(v => 
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );
    
    return hasEmptyStringKey && allSimpleValues;
  }

  /**
   * Sanitize property names for TypeScript
   */
  static sanitizePropertyName(key: string): string {
    // Remove trailing '?' for optional properties
    const cleanKey = key.replace('?', '')
                        .replace('$', '')
                        .replace('^', '')
    
    // If key contains special characters or spaces, wrap in quotes
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanKey)) {
      return `"${cleanKey}"`;
    }
    
    return cleanKey;
  }

  /**
   * Utility method to parse JSON string and generate declaration
   */
  static fromJsonString(jsonString: string, interfaceName?: string): string {
    try {
      const parsed = JSON.parse(jsonString);
      return Generator.generateDeclaration(parsed, interfaceName);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Utility method to generate declaration from object
   */
  static fromObject(obj: any, interfaceName?: string): string {
    return Generator.generateDeclaration(obj, interfaceName);
  }

  static async validateData<T extends Record<string, any>>(collection: string, data: T) {

        let schema: Record<string, any> = {}
        
        if(this.collectionSchemas.has(collection)) {
            schema = this.collectionSchemas.get(collection)!
        } else {
            try {
                schema = await Bun.file(`${this.SCHEMA_DIR}/${collection}.json`).json();
                this.collectionSchemas.set(collection, schema);
            } catch (error) {
                throw new Error(`Failed to load schema for collection '${collection}': ${error}`);
            }
        }

        const validateObject = (data: Record<string, any>, schema: Record<string, any>, path?: string) => {

            for (let dataKey in data) {

                if (!(dataKey in schema) && !(`^${dataKey}$` in schema) && !(`${dataKey}?` in schema)) {
                    throw new Error(`Property '${dataKey}' does not exist in the '${collection}' collection schema`);
                }
            }

            for(let schemaKey in schema) {

                const schemaValue = schema[schemaKey]
                const dataValue = data[Generator.sanitizePropertyName(schemaKey)]

                const valueIsDefined = dataValue !== null && dataValue !== undefined

                const fullPath = path ? `${path}.${Generator.sanitizePropertyName(schemaKey)}` : Generator.sanitizePropertyName(schemaKey)
                
                const isNullable = schemaKey.endsWith('?')

                schemaKey = isNullable ? schemaKey.replace('?', '') : schemaKey
                
                const expectedType = typeof schemaValue
                const actualType = typeof dataValue

                const hasRegex = schemaKey.startsWith('^') && schemaKey.endsWith('$') && expectedType === "string"

                const regEx = new RegExp(schemaValue)

                if(hasRegex && !isRegExp(regEx)) {
                    throw new Error(`Invalid RegEx pattern for '${fullPath}' in '${collection}' collection`)
                }
                
                schemaKey = hasRegex ? schemaKey.replace('^', '').replace('$','') : schemaKey
                
                const hasDefaultValue = (schemaValue !== "" || schemaValue !== -0 || Array.isArray(schemaValue)) && !hasRegex

                if(actualType !== expectedType && !isNullable) {
                    throw new Error(
                        `Type mismatch for '${fullPath}' in '${collection}' collection: ` +
                        `expected '${expectedType}' but got '${actualType}'`
                    );
                }
                
                if(!valueIsDefined && !isNullable) {
                    throw new Error(`Property '${fullPath}' cannot be null or undefined in '${collection}' collection`)
                }

                if(valueIsDefined && hasRegex && !regEx.test(dataValue)) {
                    throw new Error(`RegEx pattern fails for property '${fullPath}' in '${collection}' collection`)
                }

                if(!valueIsDefined && isNullable && hasDefaultValue) {
                    data[schemaKey] = schemaValue
                }

                if(valueIsDefined && expectedType === "object" && !Array.isArray(dataValue)) {
                    
                    const entires = Object.entries(schemaValue)
                    
                    const isEmpty = Array.from(entires).some(entry => entry[0] === "")

                    if(!isEmpty) data[schemaKey] = validateObject(dataValue, schemaValue, fullPath)
                    else {
                        const [, value ] = entires[0]

                        for(const [k, v] of Object.entries(dataValue)) {

                            if(typeof v !== typeof value) {
                                throw new Error(
                                    `Type mismatch for '${fullPath}.${k}' in '${collection}' collection: ` +
                                    `expected '${typeof value}' but got '${typeof v}'`
                                )
                            }
                        }
                    }
                }

                if(valueIsDefined && expectedType === "object" && Array.isArray(dataValue) && Array.isArray(schemaValue)) {
                    
                    const dataTypes = Array.from(new Set(dataValue.map(val => typeof val)))

                    const schemaTypes = Array.from(new Set(schemaValue.map(val => typeof val)))

                    for(const dataType of dataTypes) {

                        if(!schemaTypes.includes(dataType)) {

                            throw new Error(
                                `Type mismatch for '${fullPath}' in '${collection}' collection: ` +
                                `'${dataType}' is not included in [${schemaTypes.join(',')}]`
                            )
                        }
                    }
                }
            }

            return data
        }

        return validateObject(data, schema)
    }
}