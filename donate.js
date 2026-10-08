/* ==========================================================
   BHOOMISURAKSHA V10 - DONATE PAGE LOGIC
   Mocks GiveIndia API + Razorpay + PAN Validation
========================================================== */

let lastToastMsg = "";

// SPAM-PROOF TOAST NOTIFICATION
function showToast(message, type = 'info') {
    if (message === lastToastMsg) return;
    lastToastMsg = message; setTimeout(() => lastToastMsg="", 4000);

    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    let icon = 'fa-circle-info', color = 'var(--c-cyan)';
    
    if (type === 'success') { icon = 'fa-circle-check'; color = 'var(--c-green)'; }
    if (type === 'error')   { icon = 'fa-circle-xmark'; color = 'var(--c-red)'; }
    if (type === 'warning') { icon = 'fa-triangle-exclamation'; color = 'var(--c-orange)'; }

    toast.style.borderLeftColor = color;
    toast.innerHTML = `<i class="fa-solid ${icon}" style="color:${color}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3500);
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Simulate API Fetch for Progress Bars (GiveIndia Mock)
    setTimeout(() => {
        // Assam: Raised 1.2Cr out of 5Cr (24%)
        document.getElementById('assamBar').style.width = '24%';
        document.getElementById('assamRaised').innerText = 'Raised: ₹1.2 Cr';

        // Wayanad: Raised 1.7Cr out of 2Cr (85%)
        document.getElementById('wayanadBar').style.width = '85%';
        document.getElementById('wayanadRaised').innerText = 'Raised: ₹1.7 Cr';
    }, 500); // Delay for animation effect

    // 2. Amount Button Selection Logic
    const amtBtns = document.querySelectorAll('.amt-btn');
    const customAmtInput = document.getElementById('customAmount');

    amtBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active from all
            amtBtns.forEach(b => b.classList.remove('active'));
            // Add to clicked
            e.target.classList.add('active');
            // Update input
            customAmtInput.value = e.target.getAttribute('data-val');
        });
    });

    // If user types custom amount, remove active from buttons
    customAmtInput.addEventListener('input', () => {
        amtBtns.forEach(b => b.classList.remove('active'));
    });

    // 3. Payment Method Radio Styling
    const payRadios = document.querySelectorAll('.pay-radio');
    payRadios.forEach(radio => {
        radio.addEventListener('click', () => {
            payRadios.forEach(r => r.classList.remove('active'));
            radio.classList.add('active');
            radio.querySelector('input').checked = true;
        });
    });

    // 4. PAN Card Auto-Uppercase
    const panInput = document.getElementById('donorPan');
    panInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });

    // 5. Form Submission Logic
    const form = document.getElementById('donationForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const amount = customAmtInput.value;
        const name = document.getElementById('donorName').value;
        const email = document.getElementById('donorEmail').value;
        const pan = panInput.value;
        const payMethod = document.querySelector('input[name="payMethod"]:checked').value;

        // PAN Validation (if provided)
        if (pan.length > 0) {
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
            if (!panRegex.test(pan)) {
                showToast("Invalid PAN format. Example: ABCDE1234F", "error");
                panInput.focus();
                return;
            }
        }

        if (amount < 1) {
            showToast("Amount must be greater than 0", "warning");
            return;
        }

        const btn = document.getElementById('payBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing Secure Gateway...';
        btn.disabled = true;

        // --- HACKATHON PAYMENT MOCKING LOGIC ---
        setTimeout(() => {
            if (payMethod === 'razorpay') {
                // Simulate Razorpay Checkout Modal
                var options = {
                    "key": "rzp_test_mock_key", // Simulated key
                    "amount": amount * 100, // Razorpay takes amount in paise
                    "currency": "INR",
                    "name": "BhoomiSuraksha Relief",
                    "description": "Donation for Disaster Relief",
                    "image": "https://cdn-icons-png.flaticon.com/512/7510/7510486.png",
                    "handler": function (response){
                        showToast(`Payment of ₹${amount} successful! Receipt sent to ${email}`, "success");
                        if(pan) showToast("80G Tax Exemption Certificate will be emailed shortly.", "info");
                        form.reset();
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    },
                    "prefill": {
                        "name": name,
                        "email": email
                    },
                    "theme": {
                        "color": "#06b6d4"
                    }
                };
                // We use a try-catch because if razorpay script didn't load, we fallback gracefully
                try {
                    var rzp1 = new Razorpay(options);
                    rzp1.on('payment.failed', function (response){
                        showToast("Payment Failed. Please try again.", "error");
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    });
                    rzp1.open();
                } catch(err) {
                    // Fallback if SDK blocked by adblocker
                    showToast(`Mock Payment of ₹${amount} successful! (Gateway By-passed)`, "success");
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    form.reset();
                }

            } else if (payMethod === 'upi') {
                // Simulate UPI Deep Linking
                showToast("Opening UPI App (GPay/PhonePe)...", "info");
                
                // Fallback success simulation after 2 seconds
                setTimeout(() => {
                    showToast(`UPI Payment of ₹${amount} successful! Receipt sent.`, "success");
                    form.reset();
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }, 2000);
            }
        }, 1500); // Artificial delay to look realistic
    });
});