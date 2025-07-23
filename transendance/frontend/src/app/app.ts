import { Component, OnInit } from '@angular/core';
import { ApiService } from './api.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  imports: [RouterModule]
})
export class App implements OnInit {
  counter = 0;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getCounter().subscribe({
      next: (res) => this.counter = res.value,
      error: (err) => console.error('Failed to load counter:', err)
    });
  }

  increment() {
    this.api.incrementCounter().subscribe({
      next: (res) => this.counter = res.value,
      error: (err) => console.error('Failed to increment counter:', err)
    });
  }

  title() {
    return 'Transcendance';
  }
}