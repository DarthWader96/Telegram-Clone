const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
    username: String,
    customId: { type: String, unique: true, required: true }, // Zangi ilovasidagidek noyob ID
    phone: { type: String, unique: true, sparse:true }, // Kontaktlar orqali topish uchun
    status: { type: String, default: "offline" },
    lastSeen: { type: Date, default: Date.now }, // Oxirgi faollik vaqti
    createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model("User", userSchema)