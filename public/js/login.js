async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/admin';
        } else {
            errorMessage.textContent = 'Invalid username or password';
        }
    } catch (error) {
        errorMessage.textContent = 'An error occurred. Please try again.';
        console.error('Login error:', error);
    }
}

// Check if user is already logged in
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (!data.isAuthenticated && !window.location.href.includes('login.html')) {
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

// Check auth status when loading admin pages
if (window.location.href.includes('admin.html')) {
    checkLoginStatus();
} 