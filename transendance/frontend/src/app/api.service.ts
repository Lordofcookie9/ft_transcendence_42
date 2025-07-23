import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getCounter(): Observable<{ value: number }> {
    return this.http.get<{ value: number }>(`${this.baseUrl}/counter`);
  }

  incrementCounter(): Observable<{ value: number }> {
    return this.http.post<{ value: number }>(`${this.baseUrl}/counter`, {});
  }
}