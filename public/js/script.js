// Carousel functionality
let currentSlide = 0;
const slides = document.querySelectorAll('.carousel-slide');
const indicators = document.querySelectorAll('.indicator');
const totalSlides = slides.length;

// Initialize slides
function updateSlides() {
    slides.forEach((slide, index) => {
        slide.style.transform = `translateX(${100 * (index - currentSlide)}%)`;
    });
    
    // Update indicators
    indicators.forEach((indicator, index) => {
        indicator.classList.toggle('active', index === currentSlide);
    });
}

// Next slide
function nextSlide() {
    currentSlide = (currentSlide + 1) % totalSlides;
    updateSlides();
}

// Previous slide
function prevSlide() {
    currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
    updateSlides();
}

// Add click events to arrows
document.querySelector('.carousel-arrow.right').addEventListener('click', nextSlide);
document.querySelector('.carousel-arrow.left').addEventListener('click', prevSlide);

// Add click events to indicators
indicators.forEach((indicator, index) => {
    indicator.addEventListener('click', () => {
        currentSlide = index;
        updateSlides();
    });
});

// Initialize carousel
updateSlides();

// Optional: Auto-play
setInterval(nextSlide, 5000); // Change slide every 5 seconds 