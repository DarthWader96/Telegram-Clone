const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const mongoose = require("mongoose")
const cors = require("cors")
const Message = require("./models/Message")
const User = require("./models/User")
require("dotenv").config()

const app = express()
app.use(cors())
app.use(express.json())

const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "*", // Capacitor ilovasi uchun hamma joydan ruxsat beramiz
        methods: ["GET", "POST"]
    }
})


app.get('/api/messages/:from/:to', async (req, res) => {
    const { from, to } = req.params
    // Ikkala tomon o'rtasidagi barcha xabarlarni topish
    const history = await Message.find({
        $or: [
            { from: from, to: to },
            { from: to, to: from },
        ]
    }).sort({ time: 1 }) // Vaqti bo'yicha tartiblash

    res.json(history)
})

app.get('/api/chat-list/:myId', async (req, res) => {
    const { myId } = req.params
    try {
        // 1. Shu foydalanuvchiga tegishli barcha xabarlarni eng yangisidan boshlab topamiz
        const messages = await Message.find({
            $or: [{ from: myId }, { to: myId }]
        }).sort({ time: -1 }) // -1 eng yangilari birinchi keladi degani

        const chatList = [];
        const processedUsers = new Set();

        // 2. Xabarlarni aylanib chiqib, har bir yangi kontakt uchun faqat 1-chi (eng so'nggi) xabarni olib qolamiz
        for (let msg of messages) {
            const partnerId = msg.from === myId ? msg.to : msg.from;

            if (!processedUsers.has(partnerId)) {
                processedUsers.add(partnerId);

                // Sherikning statusini bazadan olamiz
                const partner = await User.findOne({ customId: partnerId });

                chatList.push({
                    customId: partnerId,
                    status: partner ? partner.status : 'offline',
                    lastSeen: partner ? partner.lastSeen : null,
                    lastMessage: msg.text, // Mana shu oxirgi xabar
                    lastMessageTime: msg.time
                });
            }
        }
        res.json(chatList);
    } catch (error) {
        res.status(500).json({ error: "Ro'yxatni yuklashda xatolik" })
    }
})

// Foydalanuvchining joriy statusini olish uchun API
app.get('/api/user-status/:id', async (req, res) => {
    try {
        const user = await User.findOne({ customId: req.params.id });
        res.json({ status: user ? user.status : 'offline' });
    } catch (error) {
        res.status(500).json({ status: 'offline' });
    }
});

// MongoDB ulanishi (Hozircha test uchun local yoki Atlas)
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDb-ga muvaffaqiyatli ulandik!"))
    .catch(err => console.error("Xatolik:", err))

function generateZangiId() {
    return 'Z-' + Math.floor(100000 + Math.random() * 900000)// Masalan: Z-542189
}

// Socket.io mantiqi
io.on("connection", (socket) => {
    // 1. Foydalanuvchi ulanganda (Hali kimligini bilmaymiz, faqat socket.id bor)
    console.log("Socket ulandi:", socket.id)

    // Foydalanuvchi tizimga kirganda uni ma'lum bir xonaga (room) qo'shamiz
    socket.on("join_chat", async (userId) => {
        socket.join(userId)

        // Socket obyektiga userId-ni biriktirib qo'yamiz,
        // keyinchalik disconnect bo'lganda kim chiqib ketganini bilish uchun
        socket.customId = userId

        // Bazada statusni 'online' qilish
        await User.findOneAndUpdate({ customId: userId }, { status: 'online' });
        console.log(`${userId} hozir online`);

        // MANA SHU QATOR QO'SHILADI: Hamma chatdagilarga bu odam kirdi deb xabar berish
        io.emit("user_status_changed", { userId: userId, status: "online" });

        // Bazada bor-yo'qligini tekshirish
        let user = await User.findOne({ customId: userId })
        if (!user) {
            user = new User({ customId: userId, username: "Yangi foydalanuvchi" })
            await user.save()
            console.log("Yangi foydalanuvchi bazaga qo'shildi:", userId)
        }
    })

    // Xabar yuborish
    socket.on("send_message", async (data) => {
        try {
            // 1. Xabarni bazaga saqlash
            const newMessage = new Message({
                from: data.from,
                to: data.to,
                text: data.msg,
                time: new Date()
            })
            await newMessage.save()

            

            // Qabul qiluvchiga xabar bilan birga yuboruvchining statusini ham beramiz
            io.to(data.to).emit("receive_message", {
                from: data.from,
                msg: data.msg,
                time: newMessage.time,
                status: 'online' // Statusni qo'shdik
            });

            console.log("Xabar bazaga saqlandi!")
        } catch (error) {
            console.error("Xabarni saqlashda xatolik:", err)
        }
    })

    // 1. "Yozayapti..." holati
    socket.on("typing", (data) => {
        // data: { to: "Z-123", from: "Z-456" }
        io.to(data.to).emit("user_typing", { from: data.from })
    })

    socket.on("stop_typing", (data) => {
        io.to(data.to).emit("user_stop_typing", { from: data.from })
    })

    // 2. Uzilganda vaqtni saqlash
    socket.on("disconnect", async () => {
        if (socket.customId) {
            // Bazada statusni 'offline' qilish
            const now = Date.now();
            await User.findOneAndUpdate({ customId: socket.customId }, { status: "offline", lastSeen: now })
            console.log(`${socket.customId} hozir offline`)
            // Boshqalarga bu foydalanuvchi offline bo'lganini bildirish (ixtiyoriy)
            io.emit("user_status_changed", { userId: socket.customId, status: "offline", lastSeen: now })
        }
        console.log("Foydalanuvchi uzildi")
    })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda...`)
})