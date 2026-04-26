const mongoose = require("mongoose")

const messageChema = new mongoose.Schema({
    from: { type: String }, // Yuboruvchi ID
    to: { type: String },   // Qabul qiluvchi ID
    text: { type: String, default: "" },
    time: { type: Date, default: Date.now },
    fileUrl: { type: String, default: null }, // Rasm yoki video manzili
    fileType: { type: String, default: "text" }, // Xabar turi (text, image, video)
    isRead: { type: Boolean, default: false } // Shu qatorni qo'shing
})

module.exports = mongoose.model("Message", messageChema)