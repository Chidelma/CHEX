declare module "@vyckr/chex" {

    export default class {

        /**
         * Main method to convert JSON to TypeScript declaration
         */
        static generateDeclaration(json: any, interfaceName: string): string
    
        /**
         * Sanitize property names for TypeScript
         */
        static sanitizePropertyName(key: string): string

        /**
         * Utility method to parse JSON string and generate declaration
         */
        static fromJsonString(jsonString: string, interfaceName?: string): string

        /**
         * Utility method to generate declaration from object
         */
        static fromObject(obj: any, interfaceName?: string): string

        /**
         * Utility method to validate data
         */
        static validateData<T extends Record<string, any>>(collection: string, data: T): Promise<T>
    }
}