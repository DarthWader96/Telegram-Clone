const LOCAL_IP = "192.168.0.107"; 
let SERVER_URL;

// Agar Capacitor (mobil ilova) ichida bo'lsak, har doim IP-ni ishlatamiz
if (window.location.origin.includes('localhost') && !window.location.port) {
    // Mobil ilova muhiti (Capacitor odatda port ishlatmaydi yoki https://localhost bo'ladi)
    SERVER_URL = `http://${LOCAL_IP}:3000`;
} else {
    // Desktop brauzer muhiti
    SERVER_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? "http://localhost:3000"
        : `http://${LOCAL_IP}:3000`;
}

console.log("Ulanish manzili:", SERVER_URL);
const socket = io(SERVER_URL);
// Server manzili (Localda bo'lsa 3000-port)
// const socket = io("http://localhost:3000")

// Elementlarni tanlab olamiz
const chatItems = document.querySelectorAll(".chat-item")
const appContainer = document.querySelector(".app-container")
const backBtn = document.getElementById("back-btn")
const currentChatName = document.getElementById("current-chat-name")
const messagesContainer = document.getElementById("messages")
const msgInput = document.getElementById("msg-input")
const sendBtn = document.getElementById("send-btn")
const searchInput = document.getElementById('search-input');

let currentTargetId = ""; // Xabar yubormoqchi bo'lgan odamimizning ID-si
let unreadMessages = {} // { "Z-123": 5 } ko'rinishida saqlaymiz

// 1. Foydalanuvchi uchun vaqtinchalik ID yaratamiz (Zangi-style)
// Har doim 6 xonali raqam chiqishini ta'minlaymiz
let myId = localStorage.getItem("myZangiId");
let myName = localStorage.getItem("myZangiName");

// HIMOYALASH: Faqat tizimga kirgan bo'lsakgina (myId bor bo'lsa) serverga ulanamiz
if (myId && myId !== "null" && myId !== "undefined") {
    socket.emit("join_chat", myId);
}

const loginOverlay = document.getElementById("login-overlay");
// 1. Login holatini tekshirish
if (!myId || !myName) {
    if (loginOverlay) {
        loginOverlay.style.display = "flex";
        document.body.classList.add("modal-open"); // Scrollni bloklash
    }
} else {
    const nameElement = document.getElementById("my-name");
    if (nameElement) {
        nameElement.innerText = myName;
    }
}

// 2. IDni faqat terminalda (konsolda) ko'rinadigan qilamiz
console.log("----------------------------");
console.log("SIZNING ID-INGIZ: " + myId);
console.log("----------------------------");

// 2. Login tugmasi bosilganda
document.getElementById("login-btn").addEventListener("click", async () => {
    const username = document.getElementById("login-name").value.trim();
    const phone = document.getElementById("login-phone").value.trim();

    if (username && phone) {
        try {
            // 1. Serverga ism va raqamni yuborib tekshiramiz
            const response = await fetch(`${SERVER_URL}/api/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ username, phone })
            });

            const data = await response.json();

            // 2. Server javobini tekshiramiz
            if (data.success) {
                // Login muvaffaqiyatli! Server bergan ID ni saqlaymiz (Yangi yoki Eski)
                localStorage.setItem("myZangiId", data.customId);
                localStorage.setItem("myZangiName", username);

                // Ekranni yangilaymiz
                const nameElement = document.getElementById("my-name");
                if (nameElement) nameElement.innerText = username;

                loginOverlay.style.display = "none";
                document.body.classList.remove("modal-open");

                // Sahifani qayta yuklab, socketni ulaymiz
                location.reload();
            } else {
                // Xatolik (Masalan: Raqam band) - foydalanuvchiga ogohlantirish beramiz
                alert("Xatolik: " + data.message);
            }
        } catch (error) {
            console.error("Ulanish xatosi:", error);
            alert("Server bilan ulanib bo'lmadi!");
        }
    } else {
        alert("Iltimos, ism va telefon raqamni to'liq kiriting.");
    }
});

// 2. Serverga ulanish va xonaga kirish
socket.on("connect", () => {
    console.log("Serverga ulandik! ID:", socket.id)

    // Serverga "Men shu ID bilan kirdim" deb xabar beramiz
    socket.emit("join_chat", myId)
})

// 3. Xabarlarni qabul qilish (Boshqa foydalanuvchidan kelgan)
socket.on("receive_message", (data) => {
    // 1. FAQAT o'sha odam bilan chat ochiq bo'lsa xabarni ko'rsatamiz
    if (currentTargetId === data.from) {
        // 1. Chat ochiq bo'lgani uchun darhol serverga o'qildi deb bildiramiz
        socket.emit("messages_read", { from: data.from, to: myId });

        // 2. Xabarni ekranda ko'rsatamiz
        displayMessage(data.msg, "received", data.from, data.time)
    }

    // Sidebar-ni yangilash (Xabar + Status bilan)
    updateChatList(data.from, data.msg, data.status, null, data.username);
})

const statusLabel = document.getElementById("status");

socket.on("user_typing", (data) => {
    if (currentTargetId === data.from) {
        statusLabel.innerText = "yozmoqda...";
        statusLabel.style.color = "#2481cc";
        return
    }
    const item = document.getElementById(`chat-${data.from}`);
    if (item) {
        const p = item.querySelector("p");
        // Agar hozirgi matn allaqachon "yozmoqda..." bo'lmasa, eskisini saqlab qo'yamiz
        if (p.innerText !== "yozmoqda...") {
            item.setAttribute("data-old-msg", p.innerText);
            p.innerText = "yozmoqda...";
            p.style.color = "#2481cc"; // Diqqatni tortish uchun ko'k rang
        }
    }
});

socket.on("user_stop_typing", (data) => {
    if (currentTargetId === data.from) {
        statusLabel.innerText = "online";
        statusLabel.style.color = "#2481cc";
        return
    }

    const item = document.getElementById(`chat-${data.from}`);
    if (item) {
        const p = item.querySelector("p");
        const oldMsg = item.getAttribute("data-old-msg");
        if (oldMsg) {
            p.innerText = oldMsg;
            p.style.color = "#000"; // Asl rangiga qaytarish
        }
    }
});

socket.on("user_status_changed", (data) => {
    // AGAR BU O'ZIM BO'LSAM, TO'XTATISH
    if (data.userId === myId) return;

    // Sidebar-ni yangilashda lastSeen-ni ham uzatamiz
    updateChatList(data.userId, null, data.status, data.lastSeen);

    // 1. Tepada ochiq turgan chat statusini yangilash
    if (currentTargetId === data.userId) {
        const statusLabel = document.getElementById("status");
        const headerDot = document.getElementById("header-status-dot");

        if (data.status === "online") {
            statusLabel.innerText = "online";
            statusLabel.style.color = "#2481cc";
            headerDot.className = "status-dot status-online";
        } else {
            // Realtime offline bo'lganda vaqtni darhol yangilash
            statusLabel.innerText = formatLastSeen(data.lastSeen || new Date());
            statusLabel.style.color = "#888";
            headerDot.className = "status-dot status-offline";
        }
    }
});

socket.on("messages_marked_read", (data) => {
    // Agar ochiq turgan chatdagi odam o'qigan bo'lsa
    if (data.by === currentTargetId) {
        // Hamma kulrang bitta ptichkalarni topamiz
        const sentTicks = document.querySelectorAll(".sent-tick");
        sentTicks.forEach(tick => {
            // Klassni o'zgartiramiz: sent-tick -> read-tick
            // CSS ::after avtomatik ravishda ikkinchi ptichkani chizib beradi
            tick.classList.remove("sent-tick");
            tick.classList.add("read-tick");
        });
    }
});

// Inputga yozganda serverga bildirish
let typingTimeout;
msgInput.addEventListener("input", () => {
    socket.emit("typing", { to: currentTargetId, from: myId });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit("stop_typing", { to: currentTargetId, from: myId });
    }, 2000);
});

// Xabarni ekranda ko'rsatish uchun alohida funksiya
function displayMessage(text, type, senderId, msgTime = new Date(), isRead = false) {
    const dateObj = new Date(msgTime) // Bazadagi vaqtni yoki hozirgi vaqtni oladi
    const time = dateObj.getHours() + ":" + dateObj.getMinutes().toString().padStart(2, "0")

    // Ptichka mantiqi: Faqat biz yuborgan xabarlar uchun
    let ticksHTML = "";
    if (type === "sent") {
        // isRead bo'lsa 'read-tick', bo'lmasa 'sent-tick' klassi beriladi
        const tickClass = isRead ? "read-tick" : "sent-tick";
        ticksHTML = `
            <div class="tick-container">
                <span class="tick ${tickClass}">✔</span>
            </div>
        `;
    }

    const messageHTML = `
        <div class="message ${type}">
            <p>${text}</p>
            <span class="time">${time} ${ticksHTML}</span>
        </div>
    `

    messagesContainer.innerHTML += messageHTML
    messagesContainer.scrollTop = messagesContainer.scrollHeight
}

let lastSearchedId = null; // Qidiruvda topilgan vaqtinchalik IDni eslab qolish uchun

// Funksiya endi async bo'ldi
function updateChatList(userId, lastMsg = null, status = null, lastSeen = null, userName = null) {
    // AGAR BU O'ZIM BO'LSAM, RO'YXATGA QO'SHMASLIK
    if (userId === myId) return;

    const chatList = document.getElementById("chat-list")
    const existingItem = document.getElementById(`chat-${userId}`)

    // Ismni aniqlash: argumentdan, elementdan yoki IDdan
    let displayName = userName;
    if (!displayName && existingItem) {
        displayName = existingItem.querySelector("h4").innerText;
    }
    if (!displayName) displayName = userId;

    // MUHIM O'ZGARIŞ: Agar bu yangi odam bo'lsa va hali xabar kelmagan bo'lsa (faqat status o'zgargan bo'lsa),
    // uni ro'yxatga qo'shmaymiz.
    if (!existingItem && lastMsg === null) {
        return;
    }

    // --- MUHIM O'ZGARISH SHU YERDA ---
    // Faqat yangi xabar kelgandagina va chat ochiq bo'lmagandagina sanaymiz
    if (lastMsg !== null && lastMsg !== "Yangi chat") {
        if (currentTargetId !== userId) {
            unreadMessages[userId] = (unreadMessages[userId] || 0) + 1;
        } else {
            unreadMessages[userId] = 0;
            // Agar chat ochiq bo'lsa, serverga o'qildi deb bildiramiz
            socket.emit("messages_read", { from: userId, to: myId });
        }
    }

    const count = unreadMessages[userId] || 0;
    const countHTML = count > 0 ? `<span class="unread-badge">${count}</span>` : "";

    // Agar bu odam ro'yxatda bo'lsa, uni shunchaki tepaga suramiz
    if (existingItem) {
        // Oxirgi xabarni yangilash (agar berilgan bo'lsa)
        if (lastMsg && lastMsg !== "Yangi chat") {
            existingItem.querySelector("p").innerText = lastMsg;
        }
        existingItem.querySelector("h4").innerText = displayName;

        // STATUSNI yangilash (Eng muhim joyi!)
        if (status) {
            const dot = existingItem.querySelector(".status-dot");
            if (dot) dot.className = `status-dot status-${status}`;

            // updateChatList ichidagi tegishli qatorlarni shunga o'zgartiring
            if (lastSeen) {
                existingItem.setAttribute("data-lastseen", lastSeen);
            } else if (!existingItem.hasAttribute("data-lastseen")) {
                // Agar vaqt kelmasa va oldin ham bo'lmasa, hozirgi vaqtni qo'yib turamiz
                existingItem.setAttribute("data-lastseen", new Date().toISOString());
            }
        }

        // Eski badgeni o'chirib, yangisini qo'shish
        const oldBadge = existingItem.querySelector(".unread-badge");
        if (oldBadge) oldBadge.remove();

        // Agar son 0 dan katta bo'lsa yoki serverdan kelgan (user.unreadCount) bo'lsa ko'rsatish
        if (count > 0) {
            existingItem.querySelector(".chat-info").insertAdjacentHTML('beforeend', countHTML);
        }
        // Faqatgina yangi xabar kelsagina eng tepaga chiqaramiz
        if (lastMsg && lastMsg !== "Yangi chat") {
            chatList.prepend(existingItem);
        }
        return
    }


    // Agar ro'yxatda bo'lmasa, yangi yaratamiz
    const initialStatus = status || 'offline';
    const chatItem = document.createElement("div");
    chatItem.className = "chat-item";
    chatItem.id = `chat-${userId}`;

    // Vaqtni boshlang'ich qiymat bilan biriktirib qo'yamiz
    chatItem.setAttribute("data-lastseen", lastSeen || new Date().toISOString());

    // HTML ichiga status-dot ni dinamik status bilan qo'shdik
    chatItem.innerHTML = `
            <div class="avatar">
                ${displayName.charAt(0).toUpperCase()}
                <div class="status-dot status-${initialStatus}"></div>
            </div>
            <div class="chat-info">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <h4>${displayName}</h4>
                ${countHTML}
                </div>
                <p>${lastMsg}</p>
            </div>
        `;


    // YANGI CHAT UCHUN CLICK HODISASI (Qora rang muammosi shu yerda hal bo'ldi)
    chatItem.addEventListener("click", () => {
        const dot = chatItem.querySelector(".status-dot");
        const isOnline = dot.classList.contains("status-online");
        const latestLastSeen = chatItem.getAttribute("data-lastseen");

        // Domdan status labelni topamiz
        const statusLabel = document.getElementById("status");

        if (isOnline) {
            statusLabel.innerText = "online";
            statusLabel.style.color = "#2481cc"; // Ko'k rangga o'tadi
        } else {
            statusLabel.innerText = formatLastSeen(latestLastSeen);
            statusLabel.style.color = "#888"; // Kulrangga o'tadi
        }

        handleChatClick(chatItem, userId);
        appContainer.classList.add("chat-open"); // Mobil qurilmalar (Poco X6 va hkz) uchun
    });

    chatList.prepend(chatItem) // Eng tepaga qo'shish
}

// O'qilganlikni serverga bildirish
function notifyRead(partnerId) {
    if (!partnerId) return;
    socket.emit("messages_read", { from: partnerId, to: myId });
}

// Takrorlanishni kamaytirish uchun Click funksiyasi
function handleChatClick(element, userId) {
    currentTargetId = userId;
    unreadMessages[userId] = 0; // Raqamni nolga tushirish

    const badge = element.querySelector(".unread-badge");
    if (badge) badge.remove();

    // 1. Ismni va Avatardagi harfni yangilash
    const userName = element.querySelector("h4").innerText;
    document.getElementById("current-chat-name").innerText = userName;
    document.getElementById("chat-avatar-letter").innerText = userName.charAt(0).toUpperCase();

    // 2. Status yozuvi va Nuqta rangini yangilash
    const sidebarDot = element.querySelector(".status-dot");
    const statusLabel = document.getElementById("status");
    const headerDot = document.getElementById("header-status-dot");

    if (sidebarDot.classList.contains("status-online")) {
        statusLabel.innerText = "online";
        statusLabel.style.color = "#2481cc";
        headerDot.className = "status-dot status-online"; // Yashil rang
    } else {
        const lastSeen = element.getAttribute("data-lastseen");
        statusLabel.innerText = formatLastSeen(lastSeen);
        statusLabel.style.color = "#888";
        headerDot.className = "status-dot status-offline"; // Kulrang
    }


    document.querySelectorAll(".chat-item").forEach(i => i.classList.remove("active"));
    element.classList.add("active");

    loadChatHistory(userId);

    // Xabarlarni o'qildi deb belgilash
    notifyRead(userId);
}

async function loadChatHistory(targetId) {
    messagesContainer.innerHTML = "" // Avvalgi xabarlarni tozalash

    const response = await fetch(`${SERVER_URL}/api/messages/${myId}/${targetId}`)
    const messages = await response.json()

    messages.forEach(m => {
        const type = (m.from === myId) ? 'sent' : 'received'
        displayMessage(m.text, type, m.from, m.time, m.isRead)
    })
}





searchInput.addEventListener("input", async (e) => {
    const searchTerm = e.target.value.trim(); // Serverga yuborish uchun asl holi
    const searchTermUpper = searchTerm.toUpperCase(); // Ismlarni filter qilish uchun

    const idRegex = /^Z-\d{6}$/;
    // Telefon raqami formati (masalan: +998901234567 yoki 998901234567)
    const phoneRegex = /^\+?\d{9,15}$/;

    // 1. Mavjud chatlarni filter qilish
    const items = document.querySelectorAll(".chat-item");
    items.forEach(item => {
        const title = item.querySelector("h4").innerText.toUpperCase();
        const id = item.id.toUpperCase();
        // Agar qidiruv bo'sh bo'lsa hamma chiqsin, bo'lmasa moslari
        if (searchTerm === "") {
            item.style.display = "flex";
        } else {
            item.style.display = (title.includes(searchTermUpper) || id.includes(searchTermUpper)) ? "flex" : "none";
        }
    });

    // 2. BACKSPACE MUAMMOSI: Agar qidiruv maydoni o'chirilsa va vaqtinchalik chat bo'lsa
    if (!idRegex.test(searchTermUpper) && !phoneRegex.test(searchTerm) && lastSearchedId) {
        const tempItem = document.getElementById(`chat-${lastSearchedId}`);
        if (tempItem && tempItem.querySelector("p").innerText === "Yangi chat") {
            if (currentTargetId === lastSearchedId) {
                currentTargetId = "";
                document.getElementById("current-chat-name").innerText = "";
                document.getElementById("status").innerText = "";
                messagesContainer.innerHTML = "";
                appContainer.classList.remove("chat-open");
            }
            tempItem.remove();
            lastSearchedId = null;
        }
    }

    // 3. TO'LIQ ID YOKI TELEFON RAQAM YOZILSA: Serverdan qidirish

    // A. AGAR ID YOZILSA (Z-123456)
    if (idRegex.test(searchTermUpper)) {
        const existing = document.getElementById(`chat-${searchTermUpper}`);
        if (!existing) {
            try {
                const response = await fetch(`${SERVER_URL}/api/user-status/${searchTermUpper}`);
                if (response.ok) {
                    const data = await response.json();
                    updateChatList(searchTermUpper, "Yangi chat", data.status, data.lastSeen, data.username);
                    lastSearchedId = searchTermUpper;
                }
            } catch (err) { console.log("ID topilmadi"); }
        }
    }
    // B. AGAR TELEFON RAQAM YOZILSA (+998...)
    else if (phoneRegex.test(searchTerm)) {
        // Telefon raqami bo'yicha qidirganda bizga baribir foydalanuvchining ID-si kerak
        try {
            const response = await fetch(`${SERVER_URL}/api/search-user/${encodeURIComponent(searchTerm)}`);
            const data = await response.json();

            if (data.success) {
                const user = data.user;
                // O'zimizni qidirayotgan bo'lsak to'xtatamiz
                if (user.customId === myId) return;

                const existing = document.getElementById(`chat-${user.customId}`);
                if (!existing) {
                    updateChatList(user.customId, "Yangi chat", user.status, user.lastSeen, user.username);
                    lastSearchedId = user.customId;
                }
            }
        } catch (err) { console.log("Raqam topilmadi"); }
    }
});

// 2. Mobil versiyada orqaga qaytish
backBtn.addEventListener("click", () => {
    appContainer.classList.remove("chat-open")

    // MUHIM QISM: Chatdan chiqqanimizni dasturga bildirish uchun ID ni tozalaymiz
    currentTargetId = "";
    document.getElementById("current-chat-name").innerText = "";
    document.getElementById("status").innerText = "";
})

// 3. Xabar yuborish funksiyasi
function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentTargetId) return;

    const msgData = {
        from: myId,
        to: currentTargetId,
        msg: text
    };

    socket.emit("send_message", msgData);

    displayMessage(text, "sent", myId, new Date());

    // MANA SHU QATOR QO'SHILADI: Yuboruvchi o'zining chat ro'yxatini yangilashi uchun
    updateChatList(currentTargetId, text, 'online');

    msgInput.value = "";
}

// Tugmaga bosganda yuborish
sendBtn.addEventListener("click", sendMessage)

// Enter tugmasini bosganda yuborish
msgInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage()
    }
})

// Sahifa yuklanganda ishlaydi
window.addEventListener("DOMContentLoaded", () => {
    loadMyChatList()
})

async function loadMyChatList() {
    const response = await fetch(`${SERVER_URL}/api/chat-list/${myId}`)
    const contacts = await response.json()

    const chatListElement = document.getElementById('chat-list')
    chatListElement.innerHTML = "" // Tozalash

    contacts.forEach(user => {
        // 1. FILTR: O'zimizni ro'yxatda ko'rsatmaymiz
        if (user.customId === myId) return;

        // SERVERDAN KELGAN SONNI ESKOQDA SAQLASH
        unreadMessages[user.customId] = user.unreadCount || 0;

        // Har bir kontaktni sidebar-ga qo'shamiz
        const chatItem = document.createElement("div")
        chatItem.className = 'chat-item'

        // BU YERDA ID QO'SHILDI (Dublikatni oldini olish uchun)
        chatItem.id = `chat-${user.customId}`

        // user.lastSeen bazada bo'lsa uni, bo'lmasa hozirgi vaqtni ISO formatda qo'yamiz
        const initialTime = user.lastSeen ? new Date(user.lastSeen).toISOString() : new Date().toISOString();
        chatItem.setAttribute("data-lastseen", initialTime);

        // Statusga qarab klass tanlaymiz
        const statusClass = user.status === 'online' ? 'status-online' : 'status-offline';

        // Ism yo'q bo'lsa ID ni ishlatamiz
        const displayName = user.username || user.customId;

        // YANGI: Badge HTML-ni tayyorlash
        let unreadBadgeHTML = "";
        if (user.unreadCount > 0) {
            unreadBadgeHTML = `<span class="unread-badge">${user.unreadCount}</span>`;
        }

        chatItem.innerHTML = `
            <div class="avatar">
                ${displayName.charAt(0).toUpperCase()}
                <div class="status-dot ${statusClass}"></div>
            </div>
            <div class="chat-info">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <h4>${displayName}</h4>
                    ${unreadBadgeHTML}
                </div>
                <p>${user.lastMessage || "Yangi chat"}</p>
            </div>
        `

        // Kontakt bosilganda chat tarixini yuklash
        chatItem.addEventListener("click", () => {
            // Chat bosilganda badgeni vizual o'chirish
            const badge = chatItem.querySelector(".unread-badge");
            if (badge) badge.remove();

            // 2. Serverga "o'qildi" deb xabar berish (Refreshda qaytib chiqmasligi uchun)
            socket.emit("messages_read", { from: user.customId, to: myId });

            // MUHIM: Statusni obyekt ichidan emas, balki sidebar-dagi dumaloqchadan olamiz
            // Chunki dumaloqcha realtime yangilangan, 'user' obyekti esa eskirgan bo'lishi mumkin
            const dot = chatItem.querySelector(".status-dot");
            const isOnline = dot.classList.contains("status-online");

            // Eng so'nggi vaqtni HTML elementidan o'qib olamiz
            const latestLastSeen = chatItem.getAttribute("data-lastseen");

            const statusLabel = document.getElementById("status");
            if (isOnline) {
                statusLabel.innerText = "online";
                statusLabel.style.color = "#2481cc";
            } else {
                // Formatlashda eng yangi vaqtni ishlatamiz
                statusLabel.innerText = formatLastSeen(latestLastSeen);
                statusLabel.style.color = "#888";
            }

            handleChatClick(chatItem, user.customId);

            // Mobil versiyada oynani ochish
            appContainer.classList.add("chat-open")
        })

        chatListElement.appendChild(chatItem)
    })
}

function formatLastSeen(date) {
    if (!date || date === "null" || date === "undefined") return "hozirgina";

    const last = new Date(date);
    // Agar sana baribir noto'g'ri bo'lsa (Invalid Date)
    if (isNaN(last.getTime())) return "hozirgina";

    const now = new Date();
    const diff = Math.floor((now - last) / 1000); // sekundlarda

    if (diff < 5) return "hozirgina";
    if (diff < 60) return diff + " soniya avval";
    if (diff < 3600) return Math.floor(diff / 60) + " daqiqa avval";
    if (diff < 86400) return Math.floor(diff / 3600) + " soat avval";
    return Math.floor(diff / 86400) + " kun avval";
}
