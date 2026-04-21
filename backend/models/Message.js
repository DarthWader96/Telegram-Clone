const mongoose = require("mongoose")

const messageChema = new mongoose.Schema({
    from: { type: String, required: true }, // Yuboruvchi ID
    to: { type: String, required: true },   // Qabul qiluvchi ID
    text: { type: String, required: true },
    time: { type: Date, default: Date.now },

})

module.exports = mongoose.model("Message", messageChema)