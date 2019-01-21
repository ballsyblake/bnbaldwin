// Please see documentation at https://docs.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

// Write your JavaScript code.
var top1 = document.getElementById("top1");
var top2 = document.getElementById("top2");
var bottom1 = document.getElementById("bottom1");
var bottom2 = document.getElementById("bottom2");
var topBar = document.getElementById("topBar");

function expandBoxes(box){
    if (box == top1) {
        top1.style.height = "60%";
        top1.style.width = "80%";
        top2.style.height = "60%";
        top2.style.width = "20%";
        bottom1.style.height = "20%";
        bottom1.style.width = "80%";
        bottom2.style.height = "20%";
        bottom2.style.width = "20%";
    }
    else if (box == top2) {
        top1.style.height = "60%";
        top1.style.width = "25%";
        top2.style.height = "60%";
        top2.style.width = "75%";
        bottom1.style.height = "20%";
        bottom1.style.width = "25%";
        bottom2.style.height = "20%";
        bottom2.style.width = "75%";
    }
    else if (box == bottom1) {
        top1.style.height = "20%";
        top1.style.width = "78%";
        top2.style.height = "20%";
        top2.style.width = "22%";
        bottom1.style.height = "60%";
        bottom1.style.width = "78%";
        bottom2.style.height = "60%";
        bottom2.style.width = "22%";
    }
    else if (box == bottom2) {
        top1.style.height = "20%";
        top1.style.width = "27%";
        top2.style.height = "20%";
        top2.style.width = "73%";
        bottom1.style.height = "60%";
        bottom1.style.width = "27%";
        bottom2.style.height = "60%";
        bottom2.style.width = "73%";
    }
    else if (box == topBar) {
        top1.style.height = "40%";
        top1.style.width = "50%";
        top2.style.height = "40%";
        top2.style.width = "50%";
        bottom1.style.height = "40%";
        bottom1.style.width = "50%";
        bottom2.style.height = "40%";
        bottom2.style.width = "50%";
    }
    else {
        top1.style.height = "40%";
        top1.style.width = "50%";
        top2.style.height = "40%";
        top2.style.width = "50%";
        bottom1.style.height = "40%";
        bottom1.style.width = "50%";
        bottom2.style.height = "40%";
        bottom2.style.width = "50%";
    }
}

function clipboard() {

}
