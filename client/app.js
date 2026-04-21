// Server manzili (Localda bo'lsa 3000-port)
const socket = io("http://localhost:3000")

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
// Keyinchalik buni bazadan olamiz
let myId = localStorage.getItem("myZangiId") || "Z-" + Math.floor(Math.random() * 1000000)
localStorage.setItem("myZangiId", myId)

// ID-ni ekranda ko'rsatish
document.getElementById("my-id").innerText = myId

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
        displayMessage(data.msg, "received", data.from, data.time)
    } 

    // Sidebar-ni yangilash (Xabar + Status bilan)
    updateChatList(data.from, data.msg, 'online');
})

const statusLabel = document.getElementById("status");

socket.on("user_typing", (data) => {
    if (currentTargetId === data.from) {
        statusLabel.innerText = "yozmoqda...";
        statusLabel.style.color = "#2481cc";
    }
});

socket.on("user_stop_typing", (data) => {
    if (currentTargetId === data.from) {
        statusLabel.innerText = "online";
        statusLabel.style.color = "#888";
    }
});

socket.on("user_status_changed", (data) => {
    // AGAR BU O'ZIM BO'LSAM, TO'XTATISH
    if (data.userId === myId) return;

    // 1. Tepada ochiq turgan chat statusini yangilash
    if (currentTargetId === data.userId) {
        const statusLabel = document.getElementById("status");
        statusLabel.innerText = data.status === "online" ? "online" : "offline";
        statusLabel.style.color = data.status === "online" ? "#2481cc" : "#888";
    }

    // SIDEBAR-ni yangilash (Xabarni o'zgartirmasdan, faqat statusni)
    updateChatList(data.userId, null, data.status);

    
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
function displayMessage(text, type, senderId, msgTime = new Date()) {
    const dateObj = new Date(msgTime) // Bazadagi vaqtni yoki hozirgi vaqtni oladi
    const time = dateObj.getHours() + ":" + dateObj.getMinutes().toString().padStart(2, "0")

    const messageHTML = `
        <div class="message ${type}">
            ${type === "received" ? `<small style="color: #2481cc; display:block;">${senderId}</small>` : ""}
            <p>${text}</p>
            <span class="time">${time}</span>
        </div>
    `

    messagesContainer.innerHTML += messageHTML
    messagesContainer.scrollTop = messagesContainer.scrollHeight
}



// Funksiya endi async bo'ldi
function updateChatList(userId, lastMsg = null, status = null) {
    // AGAR BU O'ZIM BO'LSAM, RO'YXATGA QO'SHMASLIK
    if (userId === myId) return;

    const chatList = document.getElementById("chat-list")
    const existingItem = document.getElementById(`chat-${userId}`)

    // MUHIM O'ZGARIŞ: Agar bu yangi odam bo'lsa va hali xabar kelmagan bo'lsa (faqat status o'zgargan bo'lsa),
    // uni ro'yxatga qo'shmaymiz.
    if (!existingItem && lastMsg === null) {
        return; 
    }

    // 1. Xabarlar sonini hisoblash (Faqat xabar kelgan bo'lsa)
    if (lastMsg !== null && currentTargetId !== userId) {
        unreadMessages[userId] = (unreadMessages[userId] || 0) + 1;
    } else if (currentTargetId === userId) {
        unreadMessages[userId] = 0;
    }

    const count = unreadMessages[userId] || 0;
    const countHTML = count > 0 ? `<span class="unread-badge">${count}</span>` : "";

    // Agar bu odam ro'yxatda bo'lsa, uni shunchaki tepaga suramiz
    if (existingItem) {
        // Oxirgi xabarni yangilash (agar berilgan bo'lsa)
        if (lastMsg) existingItem.querySelector("p").innerText = lastMsg;

        // STATUSNI yangilash (Eng muhim joyi!)
        if (status) {
            const dot = existingItem.querySelector(".status-dot");
            if (dot) {
                dot.className = `status-dot status-${status}`;
            }
        }

        // Eski badgeni o'chirib, yangisini qo'shish
        const oldBadge = existingItem.querySelector(".unread-badge");
        if (oldBadge) oldBadge.remove();

        if (count > 0) {
            existingItem.querySelector(".chat-info").insertAdjacentHTML('beforeend', countHTML);
        }
        // Chatni ro'yxat boshiga chiqarish
        chatList.prepend(existingItem);
        return
    }


    // Agar ro'yxatda bo'lmasa, yangi yaratamiz
    const initialStatus = status || 'offline';
    const chatItem = document.createElement("div");
    chatItem.className = "chat-item";
    chatItem.id = `chat-${userId}`;

    // HTML ichiga status-dot ni dinamik status bilan qo'shdik
    chatItem.innerHTML = `
            <div class="avatar">
                ${userId.charAt(2)}
                <div class="status-dot status-${initialStatus}"></div>
            </div>
            <div class="chat-info">
                <h4>${userId}</h4>
                <p>${lastMsg}</p>
                ${countHTML}
            </div>
        `;


    // Chatga bosilganda o'sha odam bilan suhbatni ochish
    chatItem.addEventListener("click", () => handleChatClick(chatItem, userId));
    chatList.prepend(chatItem) // Eng tepaga qo'shish
}

// Takrorlanishni kamaytirish uchun Click funksiyasi
function handleChatClick(element, userId) {
    currentTargetId = userId;
    unreadMessages[userId] = 0; // Raqamni nolga tushirish

    const badge = element.querySelector(".unread-badge");
    if (badge) badge.remove();

    document.getElementById("current-chat-name").innerText = "ID: " + userId;
    document.querySelectorAll(".chat-item").forEach(i => i.classList.remove("active"));
    element.classList.add("active");

    loadChatHistory(userId);
}

async function loadChatHistory(targetId) {
    messagesContainer.innerHTML = "" // Avvalgi xabarlarni tozalash

    const response = await fetch(`http://localhost:3000/api/messages/${myId}/${targetId}`)
    const messages = await response.json()

    messages.forEach(m => {
        const type = (m.from === myId) ? 'sent' : 'received'
        displayMessage(m.text, type, m.from, m.time)
    })
}





// Qidiruv maydoniga ID yozilganda
searchInput.addEventListener("input", (e) => {
    currentTargetId = e.target.value.trim()
    document.getElementById("current-chat-name").innerText = "ID: " + currentTargetId
})

// 2. Mobil versiyada orqaga qaytish
backBtn.addEventListener("click", () => {
    appContainer.classList.remove("chat-open")
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
    const response = await fetch(`http://localhost:3000/api/chat-list/${myId}`)
    const contacts = await response.json()

    const chatListElement = document.getElementById('chat-list')
    chatListElement.innerHTML = "" // Tozalash

    contacts.forEach(user => {
        // Har bir kontaktni sidebar-ga qo'shamiz
        const chatItem = document.createElement("div")
        chatItem.className = 'chat-item'
        // BU YERDA ID QO'SHILDI (Dublikatni oldini olish uchun)
        chatItem.id = `chat-${user.customId}`

        // Statusga qarab klass tanlaymiz
        const statusClass = user.status === 'online' ? 'status-online' : 'status-offline';

        chatItem.innerHTML = `
            <div class="avatar">
                ${user.customId.charAt(2)}
                <div class="status-dot ${statusClass}"></div>
            </div>
            <div class="chat-info">
                <h4>${user.customId}</h4>
                <p>${user.lastMessage || "Yangi chat"}</p>
            </div>
        `

        // Kontakt bosilganda chat tarixini yuklash
        chatItem.addEventListener("click", () => {


            // 1. Statusni aniqlash va yozish
            if (user.status === "online") {
                statusLabel.innerText = "online";
            } else {
                statusLabel.innerText = formatLastSeen(user.lastSeen || new Date());
            }

            handleChatClick(chatItem, user.customId, user.status, user.lastSeen);

            // Mobil versiyada oynani ochish
            appContainer.classList.add("chat-open")
        })

        chatListElement.appendChild(chatItem)
    })
}

function formatLastSeen(date) {
    const now = new Date()
    const last = new Date(date)
    const diff = Math.floor((now - last) / 1000) // sekundlarda

    if (diff < 60) return "hozirgina"
    if (diff < 3600) return Math.floor(diff / 60) + " daqiqa avval"
    if (diff < 86400) return Math.floor(diff / 3600) + " soat avval"
    return Math.floor(diff / 86400) + " kun avval"
}
