import { ErrorMapper } from "utils/ErrorMapper";

export class Log {
    public static d(message: string) {
        console.log('<span style="color: brown">' + _.escape(message) + "</span>");
    }
    public static i(message: string) {
        console.log('<span style="color: white">' + _.escape(message) + "</span>");
    }
    public static w(message: string) {
        console.log('<span style="color: yellow">' + _.escape(message) + "</span>");
    }
    public static e(message: string, e?: any) {
        if (e)
            console.log(
                `<span style="color: red"> ${_.escape(message)} ErrorMessage:${_.escape(e.message)} \nStack: ${_.escape(
                    ErrorMapper.sourceMappedStackTrace(e)
                )}</span>`
            );
        else console.log('<span style="color: red">' + _.escape(message) + "</span>");
    }
}
