import {ErrorMapper} from "utils/ErrorMapper";

export class Log {
    public static d(message: string) {
        console.log('<span style="color: gray">DEBUG: ' + _.escape(message) + "</span>");
    }

    public static i(message: string) {
        console.log('<span style="color: white">INFO: ' + _.escape(message) + "</span>");
    }

    public static w(message: string) {
        console.log('<span style="color: yellow">WARN: ' + _.escape(message) + "</span>");
    }

    public static e(message: string, e?: any) {
        if (e)
            console.log(
                `<span style="color: red"ERROR: > ${_.escape(message)} ErrorMessage:${_.escape(
                    e.message
                )} \nStack: ${_.escape(ErrorMapper.sourceMappedStackTrace(e))}</span>`
            );
        else console.log('<span style="color: red">' + _.escape(message) + "</span>");
    }
}
