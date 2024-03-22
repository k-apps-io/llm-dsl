"use strict";
/**
 * An enum representing the different visibility statuses a message can hold.
 * @enum {number}
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Visibility = void 0;
// todo rename to Awareness?
var Visibility;
(function (Visibility) {
    Visibility[Visibility["SYSTEM"] = 0] = "SYSTEM";
    Visibility[Visibility["OPTIONAL"] = 1] = "OPTIONAL";
    Visibility[Visibility["REQUIRED"] = 2] = "REQUIRED";
    Visibility[Visibility["EXCLUDE"] = 3] = "EXCLUDE"; // will be removed from the context window
})(Visibility || (exports.Visibility = Visibility = {}));
