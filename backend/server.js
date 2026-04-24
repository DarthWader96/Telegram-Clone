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

// FOYDALANUVCHINI TEKSHIRISH VA LOGIN QILISH
app.post('/api/login', async (req, res) => {
    const { username, phone } = req.body;

    try {
        // 1. Bazadan shu telefon raqamini qidiramiz
        let user = await User.findOne({ phone: phone });

        if (user) {
            // 2. Agar raqam topilsa, ismni tekshiramiz
            if (user.username === username) {
                // Ism va raqam mos keldi! Unga o'zining eski ID sini qaytaramiz
                return res.json({ success: true, customId: user.customId });
            } else {
                // Raqam bor, lekin ism boshqa. Ruxsat bermaymiz!
                return res.status(400).json({
                    success: false,
                    message: "Bu telefon raqami boshqa ism bilan ro'yxatdan o'tgan!"
                });
            }
        } else {
            // 3. Agar raqam umuman yo'q bo'lsa, YANGI foydalanuvchi yaratamiz
            const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            const generatedId = "Z-" + randomNum;

            user = new User({
                username: username,
                phone: phone,      // <-- Modelda 'phone' maydoni bo'lishi kerak
                customId: generatedId,
                status: 'online',
                lastSeen: new Date()
            });
            await user.save();

            // Yangi yaratilgan ID ni qaytaramiz
            return res.json({ success: true, customId: generatedId });
        }
    } catch (error) {
        console.error("Login xatosi:", error);
        res.status(500).json({ success: false, message: "Serverda xatolik yuz berdi" });
    }
});

// Telefon raqami orqali foydalanuvchini qidirish
app.get('/api/search-user/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        // Raqamni bazadan qidiramiz
        const user = await User.findOne({ phone: phone });

        if (user) {
            res.json({
                success: true,
                user: {
                    customId: user.customId,
                    username: user.username,
                    status: user.status,
                    lastSeen: user.lastSeen
                }
            });
        } else {
            res.json({ success: false, message: "Foydalanuvchi topilmadi" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server xatosi" });
    }
});

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

                // YANGI: Faqat shu sherikdan MINGA kelgan va O'QILMAGAN xabarlar soni
                const unreadCount = await Message.countDocuments({
                    from: partnerId,
                    to: myId,
                    isRead: false // <--- Bu yerda isRead bo'ldi
                });

                chatList.push({
                    customId: partnerId,
                    username: partner ? partner.username : partnerId, // Ismni qo'shdik
                    status: partner ? partner.status : 'offline',
                    lastSeen: partner ? partner.lastSeen : null,
                    lastMessage: msg.text, // Mana shu oxirgi xabar
                    lastMessageTime: msg.time,
                    unreadCount: unreadCount // Buni frontendga uzatamiz
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
        if (user) {
            res.json({
                status: user.status,
                username: user.username,
                lastSeen: user.lastSeen
            });
        } else {
            res.status(404).json({ error: "Topilmadi" });
        }
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
        // HIMOYALASH: Agar ID bo'lmasa yoki "null" matni kelib qolsa, bazaga yozishni to'xtatamiz
        if (!userId || userId === "null" || userId === "undefined") {
            return;
        }
        socket.join(userId)

        // Socket obyektiga userId-ni biriktirib qo'yamiz,
        // keyinchalik disconnect bo'lganda kim chiqib ketganini bilish uchun
        socket.customId = userId

        // Bazada statusni 'online' qilish
        await User.findOneAndUpdate(
            { customId: userId },
            { status: "online", lastSeen: new Date().toISOString() },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`${userId} hozir online`);

        // MANA SHU QATOR QO'SHILADI: Hamma chatdagilarga bu odam kirdi deb xabar berish
        io.emit("user_status_changed", { userId: userId, status: "online", lastSeen: null });

        // Bazada bor-yo'qligini tekshirish
        let user = await User.findOne({ customId: userId })
        if (!user) {
            user = new User({ customId: userId, username: "Yangi foydalanuvchi" })
            await user.save()
            console.log("Yangi foydalanuvchi bazaga qo'shildi:", userId)
        }
    })

    // user_register eventini qo'shish
    socket.on("user_register", async (data) => {
        try {
            await User.findOneAndUpdate(
                { phone: data.phone },
                {
                    username: data.username,
                    customId: data.customId,
                    status: 'online'
                },
                { upsert: true }
            );
            console.log("Yangi foydalanuvchi:", data.username);
        } catch (err) {
            console.error("Xato:", err);
        }
    });

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

            // 2. Yuboruvchining ismini bazadan topamiz (YANGI QO'SHILGAN QATOR)
            const sender = await User.findOne({ customId: data.from });

            // Qabul qiluvchiga xabar bilan birga yuboruvchining statusini ham beramiz
            io.to(data.to).emit("receive_message", {
                from: data.from,
                username: sender ? sender.username : data.from, // Ismni qo'shdik
                msg: data.msg,
                time: newMessage.time,
                status: 'online' // Statusni qo'shdik
            });

            console.log("Xabar bazaga saqlandi!")
        } catch (error) {
            console.error("Xabarni saqlashda xatolik:", err)
        }
    })

    // XABARLARNI O'QILDI DEB BELGILASH (SHU YERGA QO'SHING)
    socket.on("messages_read", async (data) => {
        try {
            // data: { from: "Z-Partner", to: "Z-Me" }
            // "from" (sherigimiz) yozgan xabarlarni "to" (biz) o'qidik
            await Message.updateMany(
                { from: data.from, to: data.to, isRead: false },
                { $set: { isRead: true } }
            );

            // Xabarni yuborgan odamga (sherigimizga) "xabarlaring o'qildi" deb xabar beramiz
            io.to(data.from).emit("messages_marked_read", { by: data.to });
        } catch (err) {
            console.error("O'qilganlikni yangilashda xato:", err);
        }
    });

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
            // Hozirgi vaqtni ISO formatida olamiz
            const nowISO = new Date().toISOString();

            await User.findOneAndUpdate(
                { customId: socket.customId },
                { status: "offline", lastSeen: nowISO }
            );

            console.log(`${socket.customId} hozir offline`)
            // Boshqalarga ISO vaqtini yuboramiz
            io.emit("user_status_changed", {
                userId: socket.customId,
                status: "offline",
                lastSeen: nowISO
            });
        }
        console.log("Foydalanuvchi uzildi")
    })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda...`)
})