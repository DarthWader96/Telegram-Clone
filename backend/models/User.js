const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    customId: { type: String, unique: true, required: true }, // Zangi ilovasidagidek noyob ID
    phone: { type: String, required:true, unique: true, sparse:true }, // Kontaktlar orqali topish uchun
    status: { type: String, default: "offline" },
    lastSeen: { type: Date, default: Date.now }, // Oxirgi faollik vaqti
    createdAt: { type: Date, default: Date.now },
    avatar: { type: String, default: "" },
})

module.exports = mongoose.model("User", userSchema)